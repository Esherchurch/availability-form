/* ===================================================================
   EGBC — API.Bible with the church's own key (F-223, F-225; Martin, 16 Oct)
   ===================================================================

   "A box in Church settings where Martin pastes it himself; stored
   server-side, never shown again, used through a hub function."

     bibleKeySave    callable, master admins: { key } (''= remove) -> { saved }
     bibleKeyStatus  callable, master admins: -> { saved, savedAt, savedByName }
     bibleFetch      callable, a plan group's leader or a master admin:
                       { action: 'versions' } -> { bibles: [{ id, name, abbrev, lang }] }
                       { action: 'passage', bibleId, book (USFM code), ch, v1, ch2, v2 }
                         -> { reference, content ('[16] For God ...'), copyright }

   The key lives in privateSettings/apiBible, which the rules let no page
   read or write; only this file touches it. Each passage fetched also
   sends API.Bible's usage report (FUMS), which its terms ask for - the
   "no script" image address it gives, requested once.
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west2';
const BASE = 'https://api.scripture.api.bible';
const db = () => getFirestore();

async function who(req) {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  const u = (await db().collection('users').doc(uid).get()).data() || {};
  if (u.status && u.status !== 'active') throw new HttpsError('permission-denied', 'Your account is not active.');
  return { uid, memberId: String(u.memberId || ''), master: u.masterAdmin === true, name: String(u.name || '') };
}
async function mayFetch(me) {
  if (me.master) return true;
  if (!me.memberId) return false;
  const g = await db().collection('planGroups').where('leaderIds', 'array-contains', me.memberId).limit(1).get();
  return !g.empty;
}
async function key() {
  const d = (await db().collection('privateSettings').doc('apiBible').get()).data() || {};
  if (!d.key) throw new HttpsError('failed-precondition', 'The church has not added an API.Bible key yet. A master admin adds it in Church settings.');
  return d.key;
}
async function get(k, path) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(BASE + path, { headers: { 'api-key': k, accept: 'application/json' }, signal: ctl.signal });
    if (r.status === 401 || r.status === 403) throw new HttpsError('permission-denied', 'API.Bible did not accept the church\'s key (or this Bible is not on it).');
    if (r.status === 404) throw new HttpsError('not-found', 'API.Bible has no such passage in that Bible.');
    if (!r.ok) throw new HttpsError('unavailable', 'API.Bible said ' + r.status + '. Try again in a moment.');
    return await r.json();
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('unavailable', 'API.Bible could not be reached. Try again in a moment.');
  } finally { clearTimeout(t); }
}
/* The usage report: the image address in meta.fumsNoScript, requested once. */
function fums(meta) {
  const m = String((meta && meta.fumsNoScript) || '').match(/src="([^"]+)"/);
  if (m && /^https:\/\/fums\.api\.bible\//.test(m[1])) fetch(m[1]).catch(() => {});
}

export const bibleKeySave = onCall({ region: REGION }, async (req) => {
  const me = await who(req);
  if (!me.master) throw new HttpsError('permission-denied', 'Only a master admin can set the API.Bible key.');
  const k = String((req.data || {}).key || '').trim();
  if (k && !/^[A-Za-z0-9_-]{16,128}$/.test(k)) throw new HttpsError('invalid-argument', 'That does not look like an API.Bible key.');
  if (!k) { await db().collection('privateSettings').doc('apiBible').delete(); return { saved: false }; }
  await db().collection('privateSettings').doc('apiBible').set({ key: k, savedAt: new Date().toISOString(), savedBy: me.uid, savedByName: me.name });
  return { saved: true };
});

export const bibleKeyStatus = onCall({ region: REGION }, async (req) => {
  const me = await who(req);
  if (!me.master) throw new HttpsError('permission-denied', 'Only a master admin can see this.');
  const d = (await db().collection('privateSettings').doc('apiBible').get()).data() || {};
  return { saved: !!d.key, savedAt: d.savedAt || '', savedByName: d.savedByName || '' };   // never the key
});

export const bibleFetch = onCall({ region: REGION }, async (req) => {
  const me = await who(req);
  if (!(await mayFetch(me))) throw new HttpsError('permission-denied', 'API.Bible is for the leaders who plan sessions.');
  const d = req.data || {};
  const k = await key();
  if (d.action === 'versions') {
    const r = await get(k, '/v1/bibles');
    return { bibles: (r.data || []).map(b => ({ id: b.id, name: b.name, abbrev: String(b.abbreviationLocal || b.abbreviation || '').toUpperCase(), lang: (b.language || {}).name || '' }))
      .sort((a, b) => (a.lang === 'English' ? 0 : 1) - (b.lang === 'English' ? 0 : 1) || a.name.localeCompare(b.name)) };
  }
  if (d.action === 'passage') {
    const ok = (s) => typeof s === 'string' && /^[A-Za-z0-9-]{2,40}$/.test(s);
    if (!ok(d.bibleId) || !/^[1-3A-Z][A-Z]{2}$/.test(String(d.book || ''))) throw new HttpsError('invalid-argument', 'Which Bible and which book?');
    const ch = +d.ch | 0, v1 = (+d.v1 | 0) || 1, ch2 = (+d.ch2 | 0) || ch, v2 = +d.v2 | 0;
    if (ch < 1 || ch2 < ch || ch2 - ch > 3) throw new HttpsError('invalid-argument', 'Up to four chapters at a time.');
    const from = d.book + '.' + ch + '.' + v1;
    const pid = v2 ? from + '-' + d.book + '.' + ch2 + '.' + v2 : (ch2 > ch ? d.book + '.' + ch + '-' + d.book + '.' + ch2 : d.book + '.' + ch);
    const r = await get(k, '/v1/bibles/' + encodeURIComponent(d.bibleId) + '/passages/' + encodeURIComponent(pid) +
      '?content-type=text&include-verse-numbers=true&include-chapter-numbers=false&include-titles=false&include-notes=false');
    fums(r.meta);
    const p = r.data || {};
    return { reference: p.reference || '', content: String(p.content || '').slice(0, 40000), copyright: String(p.copyright || '').replace(/\s+/g, ' ').trim() };
  }
  throw new HttpsError('invalid-argument', 'Ask for "versions" or a "passage".');
});
