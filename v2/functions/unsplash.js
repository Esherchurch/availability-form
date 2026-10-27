/* ===================================================================
   EGBC — pictures from Unsplash (comms window; FINDINGS-comms plan, the
   card maker's and the e-news's pictures)
   ===================================================================

   Church HQ's own Unsplash app, under Unsplash's API guidelines
   (help.unsplash.com/en/articles/2511245-unsplash-api-guidelines):

   - THE KEY stays on the server: Secret Manager, UNSPLASH_ACCESS_KEY
     (firebase functions:secrets:set UNSPLASH_ACCESS_KEY). A page never
     sees it; it asks these two callables.
   - HOTLINKED: a picture is shown from the address Unsplash returns
     (photo.urls - images.unsplash.com, its ixid kept), never copied into
     our storage.
   - THE DOWNLOAD PING: when a picture is used (put on a card or into an
     e-news), unsplashUsed calls that photo's links.download_location.
   - THE CREDIT: "Photo by <name> on Unsplash", the name linking to the
     photographer's Unsplash page and "Unsplash" to unsplash.com, both
     with ?utm_source=church_hq&utm_medium=referral.

   DEMO MODE ALLOWS 50 REQUESTS AN HOUR, so:
   - each search (words, page, shape) is kept for a day in unsplashCache
     and answered from there - the same search costs nothing twice;
   - every call to Unsplash is counted in unsplashCache/_hour; at 45 in
     the hour (5 kept spare) a new search is answered with the last saved
     results for it, if any, and otherwise "busy, try again at :00";
   - a download ping that can't go now (the hour is used up, or Unsplash
     says no) waits in unsplashCache/_pings and goes with the next call.
   Unsplash's own X-Ratelimit-Remaining is believed when it is lower.

     runSearch({ db, fetch, key, data, now })   the work, for the checks
     runUsed({ db, fetch, key, data, now })
     unsplashSearch, unsplashUsed                the office's callables
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { isOffice } from './comms-office.js';

export const UNSPLASH_ACCESS_KEY = defineSecret('UNSPLASH_ACCESS_KEY');
const REGION = 'europe-west2';
const API = 'https://api.unsplash.com';
export const UTM = 'utm_source=church_hq&utm_medium=referral';
export const HOUR_LIMIT = 45;          // of Demo mode's 50
export const KEEP_MS = 24 * 3600000;   // a search is kept for a day
const PER_PAGE = 24;

const hourOf = now => new Date(now).toISOString().slice(0, 13);
const withUtm = u => { const s = String(u || ''); return /^https:\/\/unsplash\.com\//.test(s) ? s + (s.includes('?') ? '&' : '?') + UTM : ''; };
const okImage = u => /^https:\/\/images\.unsplash\.com\//.test(String(u || '')) ? String(u) : '';

/* The words of a search, the same however they were typed. */
export function searchKey(q, page, shape) {
  const words = String(q || '').toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const p = Math.max(1, Math.min(10, parseInt(page, 10) || 1));
  const s = ['landscape', 'portrait', 'squarish'].includes(shape) ? shape : '';
  return { words, page: p, shape: s, id: 's_' + createHash('sha256').update(words + '|' + p + '|' + s).digest('hex').slice(0, 32) };
}

/* One photo, as a page needs it: nothing more is kept or passed on. */
export function photoOf(p) {
  const u = p.user || {}, urls = p.urls || {}, links = p.links || {};
  const dl = String(links.download_location || '');
  return {
    id: String(p.id || ''),
    alt: String(p.alt_description || p.description || '').slice(0, 200),
    width: +p.width || 0, height: +p.height || 0, color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '',
    thumb: okImage(urls.thumb), small: okImage(urls.small), regular: okImage(urls.regular),
    name: String(u.name || u.username || 'Unsplash').slice(0, 80),
    profile: withUtm(u.links && u.links.html),
    page: withUtm(links.html),
    unsplash: 'https://unsplash.com/?' + UTM,
    downloadLocation: dl.startsWith(API + '/photos/') ? dl : ''
  };
}

/* The credit, as HTML (for an email) - the page shows the same words. */
export function creditHtml(ph) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return 'Photo by <a href="' + esc(ph.profile) + '">' + esc(ph.name) + '</a> on <a href="' + esc(ph.unsplash || 'https://unsplash.com/?' + UTM) + '">Unsplash</a>';
}

/* The hour's count: may we call Unsplash now? Counts the call if so. */
async function spend(db, now, n = 1) {
  const ref = db.collection('unsplashCache').doc('_hour');
  return db.runTransaction(async tx => {
    const d = (await tx.get(ref)).data() || {};
    const used = d.hour === hourOf(now) ? (+d.used || 0) : 0;
    if (used + n > HOUR_LIMIT) return false;
    tx.set(ref, { hour: hourOf(now), used: used + n });
    return true;
  });
}
/* Unsplash says how many are left; when that is fewer, believe it. */
async function heard(db, now, res) {
  const left = parseInt(res.headers && res.headers.get && res.headers.get('x-ratelimit-remaining'), 10);
  if (!Number.isFinite(left)) return;
  const ref = db.collection('unsplashCache').doc('_hour');
  await db.runTransaction(async tx => {
    const d = (await tx.get(ref)).data() || {};
    const used = d.hour === hourOf(now) ? (+d.used || 0) : 0;
    const theirs = HOUR_LIMIT - Math.max(0, left - (50 - HOUR_LIMIT));
    if (theirs > used) tx.set(ref, { hour: hourOf(now), used: Math.min(HOUR_LIMIT, theirs) });
  });
}
const call = (fetch, key, url) => fetch(url, { headers: { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1' } });

/* Download pings still owed, sent while the hour allows. */
async function owed(db, fetch, key, now) {
  const ref = db.collection('unsplashCache').doc('_pings');
  const list = ((await ref.get()).data() || {}).list || [];
  if (!list.length) return 0;
  const left = [];
  let sent = 0;
  for (const u of list) {
    if (left.length || !(await spend(db, now))) { left.push(u); continue; }
    try { const r = await call(fetch, key, u); await heard(db, now, r); if (r.ok) sent++; else left.push(u); } catch (e) { left.push(u); }
  }
  await ref.set({ list: left.slice(-200) });
  return sent;
}

export async function runSearch({ db, fetch, key, data = {}, now = Date.now() }) {
  if (!key) throw new Error('Unsplash connects once Church HQ’s key is set.');
  const k = searchKey(data.q, data.page, data.shape);
  if (k.words.length < 2) return { photos: [], total: 0, pages: 0, words: k.words };
  const ref = db.collection('unsplashCache').doc(k.id);
  const kept = (await ref.get()).data();
  if (kept && now - (+kept.at || 0) < KEEP_MS) return { photos: kept.photos || [], total: kept.total || 0, pages: kept.pages || 0, words: k.words, kept: true };
  if (!(await spend(db, now))) {
    if (kept) return { photos: kept.photos || [], total: kept.total || 0, pages: kept.pages || 0, words: k.words, kept: true, stale: true };
    return { photos: [], total: 0, pages: 0, words: k.words, busy: true, again: hourOf(now + 3600000).slice(11) + ':00' };
  }
  const url = API + '/search/photos?query=' + encodeURIComponent(k.words) + '&page=' + k.page + '&per_page=' + PER_PAGE + '&content_filter=high' + (k.shape ? '&orientation=' + k.shape : '');
  const r = await call(fetch, key, url);
  await heard(db, now, r);
  if (!r.ok) {
    if (kept) return { photos: kept.photos || [], total: kept.total || 0, pages: kept.pages || 0, words: k.words, kept: true, stale: true };
    if (r.status === 403 || r.status === 429) return { photos: [], total: 0, pages: 0, words: k.words, busy: true, again: hourOf(now + 3600000).slice(11) + ':00' };
    throw new Error('Unsplash didn’t answer (' + r.status + ').');
  }
  const j = await r.json();
  const photos = (j.results || []).map(photoOf).filter(p => p.id && p.regular && p.downloadLocation);
  const out = { photos, total: +j.total || 0, pages: +j.total_pages || 0 };
  await ref.set(Object.assign({ at: now, words: k.words, page: k.page, shape: k.shape }, out));
  await owed(db, fetch, key, now).catch(() => 0);
  return Object.assign(out, { words: k.words });
}

/* A picture was used: Unsplash's download ping, now or with the next call. */
export async function runUsed({ db, fetch, key, data = {}, now = Date.now() }) {
  if (!key) throw new Error('Unsplash connects once Church HQ’s key is set.');
  const dl = String(data.downloadLocation || '');
  if (!/^https:\/\/api\.unsplash\.com\/photos\/[A-Za-z0-9_-]{1,40}\/download(\?[A-Za-z0-9=&_.%-]{0,300})?$/.test(dl)) throw new Error('That isn’t an Unsplash photo.');
  const queue = async () => {
    const ref = db.collection('unsplashCache').doc('_pings');
    await db.runTransaction(async tx => { const l = ((await tx.get(ref)).data() || {}).list || []; if (!l.includes(dl)) l.push(dl); tx.set(ref, { list: l.slice(-200) }); });
    return { pinged: false, queued: true };
  };
  if (!(await spend(db, now))) return queue();
  try {
    const r = await call(fetch, key, dl);
    await heard(db, now, r);
    if (!r.ok) return queue();
  } catch (e) { return queue(); }
  await owed(db, fetch, key, now).catch(() => 0);
  return { pinged: true };
}

/* The office and master admins only. */
async function office(req) {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = await getFirestore().collection('users').doc(uid).get();
  const p = me.exists ? me.data() : {};
  if (!(await isOffice(getFirestore(), p))) throw new HttpsError('permission-denied', 'For the church office.');
}
const callable = run => onCall({ region: REGION, secrets: [UNSPLASH_ACCESS_KEY] }, async (req) => {
  await office(req);
  try { return await run({ db: getFirestore(), fetch: globalThis.fetch, key: UNSPLASH_ACCESS_KEY.value(), data: req.data || {} }); }
  catch (e) { throw e instanceof HttpsError ? e : new HttpsError('failed-precondition', e.message || String(e)); }
});
export const unsplashSearch = callable(runSearch);
export const unsplashUsed = callable(runUsed);
