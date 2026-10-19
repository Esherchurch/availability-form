/* ===================================================================
   Canva: connect once, list designs, import finished ones
   (comms window, 19 Oct 2026; FINDINGS-comms C-15, C-21)
   ===================================================================

   Canva's Connect API, the parts every plan has (FREE included): sign in
   (OAuth with PKCE), list your designs, export one as PNG, GIF or MP4.
   No Autofill, no brand templates (decision 3).

   THE PURE PART. Every outside thing is passed in - talking to Canva
   (fetchFn), storing a file (save), the database (db), the time (now) -
   so the check can run all of it against a pretend Canva and a pretend
   store. functions/canva.js wraps these as the hub's functions.

   WHERE THE KEYS LIVE. The client secret: Secret Manager, declared only
   when CANVA_LIVE (canva.js), like the Resend key. The church's tokens:
   integrationSecrets/canva, which the rules give to NO page. Until the
   locked rules deploy anybody could read that document, which is why
   everything here is shut on the live site until switch-over.

   TOKENS. Canva's access token lasts 4 hours; its refresh token works
   ONCE and every refresh hands back a new one. So a refresh happens in a
   transaction and the new pair is saved before anything uses it - two
   imports at once can't both spend the same refresh token.

   EXPORT LINKS last 24 hours (thumbnails 15 minutes), so an import copies
   the file into the church's own storage straight away and the picture
   library points at that copy, never at Canva.
   =================================================================== */

import { createHash, randomBytes } from 'node:crypto';

export const AUTHORIZE = 'https://www.canva.com/api/oauth/authorize';
export const API = 'https://api.canva.com/rest/v1';
export const SCOPES = ['design:meta:read', 'design:content:read'];
const TOKENS = ['integrationSecrets', 'canva'];
const b64url = b => Buffer.from(b).toString('base64url');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- connecting ------------------------------------------------------- */
export function pkce() {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}
export async function start({ db, uid, clientId, redirectUri, now = Date.now(), returnTo = '' }) {
  const { verifier, challenge } = pkce();
  const state = b64url(randomBytes(24));
  await db.collection('integrationSecrets').doc('canvaState_' + state).set({ verifier, uid, at: now, returnTo: String(returnTo).slice(0, 300) });
  const q = new URLSearchParams({ code_challenge: challenge, code_challenge_method: 's256', scope: SCOPES.join(' '), response_type: 'code', client_id: clientId, state, redirect_uri: redirectUri });
  return { url: AUTHORIZE + '?' + q.toString(), state };
}

async function tokenCall(fetchFn, apiBase, clientId, secret, form) {
  const r = await fetchFn((apiBase || API) + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(clientId + ':' + secret).toString('base64') },
    body: new URLSearchParams(form).toString()
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Canva said no: ' + (j.error_description || j.message || j.error || ('HTTP ' + r.status)));
  return j;
}

/* Canva sends the person back here with ?code=&state=. The state must be
   one we made, for the same person, in the last 15 minutes, and is used
   once. */
export async function finish({ db, code, state, clientId, secret, redirectUri, fetchFn, apiBase, now = Date.now() }) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(String(state || '')) || !code) throw new Error('That sign-in link is not one the hub made.');
  const ref = db.collection('integrationSecrets').doc('canvaState_' + state);
  const st = await ref.get();
  if (!st.exists) throw new Error('That sign-in has already been used, or was never started here.');
  await ref.delete();
  const s = st.data();
  if (now - s.at > 15 * 60000) throw new Error('That sign-in took too long. Press "Connect Canva" again.');
  const j = await tokenCall(fetchFn, apiBase, clientId, secret, { grant_type: 'authorization_code', code_verifier: s.verifier, code: String(code), redirect_uri: redirectUri });
  await db.collection(TOKENS[0]).doc(TOKENS[1]).set({
    access: j.access_token, refresh: j.refresh_token || '', expires: now + (Number(j.expires_in) || 14400) * 1000 - 60000,
    scope: String(j.scope || ''), connectedBy: s.uid, connectedAt: new Date(now).toISOString()
  });
  return { returnTo: s.returnTo || '' };
}

/* A working access token, refreshing if it has run out. The refresh token
   works once, so the refresh is CLAIMED first (a transaction that only
   writes "refreshing until"), then done once, outside any transaction - a
   transaction can be retried, and a retried refresh would spend a token
   that is already spent. Anybody else who finds it claimed waits a moment
   and reads the new token. */
export async function accessToken({ db, clientId, secret, fetchFn, apiBase, now = Date.now(), waitMs = 1000 }) {
  const ref = db.collection(TOKENS[0]).doc(TOKENS[1]);
  for (let tries = 0; tries < 20; tries++) {
    const t0 = now + tries * waitMs;
    const step = await db.runTransaction(async tx => {
      const d = await tx.get(ref);
      if (!d.exists || !d.data().access) return { error: 'Canva is not connected.' };
      const t = d.data();
      if (t.expires > t0) return { token: t.access };
      if (!t.refresh) return { error: 'Canva needs connecting again.' };
      if ((t.refreshingUntil || 0) > t0) return { wait: true };
      tx.update(ref, { refreshingUntil: t0 + 30000 });
      return { refresh: t.refresh };
    });
    if (step.error) throw new Error(step.error);
    if (step.token) return step.token;
    if (step.wait) { await sleep(waitMs); continue; }
    let j;
    try { j = await tokenCall(fetchFn, apiBase, clientId, secret, { grant_type: 'refresh_token', refresh_token: step.refresh }); }
    catch (e) { await ref.update({ refreshingUntil: 0 }).catch(() => null); throw e; }
    await ref.set({ access: j.access_token, refresh: j.refresh_token || '', expires: t0 + (Number(j.expires_in) || 14400) * 1000 - 60000, refreshingUntil: 0 }, { merge: true });
    return j.access_token;
  }
  throw new Error('Canva is busy. Try again in a moment.');
}

async function api(deps, method, p, body) {
  const tok = await accessToken(deps);
  const r = await deps.fetchFn((deps.apiBase || API) + p, { method, headers: Object.assign({ Authorization: 'Bearer ' + tok }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('Canva needs connecting again.');
  if (!r.ok) throw new Error((j && (j.message || j.code)) || ('Canva: HTTP ' + r.status));
  return j;
}

export async function status({ db }) {
  const d = await db.collection(TOKENS[0]).doc(TOKENS[1]).get();
  return d.exists && d.data().access ? { connected: true, since: d.data().connectedAt || '' } : { connected: false };
}

/* ---- the designs --------------------------------------------------------- */
export async function designs(deps, { query = '', continuation = '' } = {}) {
  const q = new URLSearchParams({ limit: '25', ownership: 'any', sort_by: 'modified_descending' });
  if (query) q.set('query', String(query).slice(0, 200));
  if (continuation) q.set('continuation', String(continuation));
  const j = await api(deps, 'GET', '/designs?' + q.toString());
  return {
    items: (j.items || []).map(x => ({ id: String(x.id || ''), title: String(x.title || 'Untitled'), thumb: (x.thumbnail && x.thumbnail.url) || '', updated: x.updated_at || 0, pages: x.page_count || 0 })),
    continuation: j.continuation || ''
  };
}

/* ---- import ---------------------------------------------------------------
   kind: 'gif' | 'png' | 'mp4'. Export, wait for it (Canva: a job), copy
   the first page's file into storage with save(path, bytes, type), then
   add it to the picture library. */
const FORMAT = {
  gif: { type: 'gif' },
  png: { type: 'png' },
  mp4: { type: 'mp4', quality: 'horizontal_1080p' }
};
const CONTENT = { gif: 'image/gif', png: 'image/png', mp4: 'video/mp4' };
export async function importDesign(deps, { designId, kind, title, uid, pollMs = 1500, maxPolls = 60 }) {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(String(designId || ''))) throw new Error('That is not a Canva design.');
  if (!FORMAT[kind]) throw new Error('Import as GIF, PNG or MP4.');
  let job = (await api(deps, 'POST', '/exports', { design_id: designId, format: FORMAT[kind] })).job || {};
  for (let i = 0; job.status === 'in_progress' && i < maxPolls; i++) {
    await sleep(pollMs);
    job = (await api(deps, 'GET', '/exports/' + encodeURIComponent(job.id))).job || {};
  }
  if (job.status !== 'success' || !(job.urls || []).length) {
    const why = job.error && job.error.code === 'license_required' ? 'This design uses paid Canva elements, so Canva won’t export it on this plan.' : (job.error && job.error.message) || 'Canva did not finish the export.';
    throw new Error(why);
  }
  const r = await deps.fetchFn(job.urls[0]);
  if (!r.ok) throw new Error('Could not fetch the file from Canva.');
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > 50 * 1048576) throw new Error('That file is over 50 MB.');
  const id = 'pic_canva_' + b64url(randomBytes(9)).replace(/[^A-Za-z0-9]/g, '');
  const path = 'library/' + id + '/canva.' + kind;
  const url = await deps.save(path, bytes, CONTENT[kind]);
  const now = new Date(deps.now || Date.now()).toISOString();
  const doc = {
    name: String(title || 'Canva design').slice(0, 80), tags: ['canva'], url, path, width: 0, height: 0,
    kind: kind === 'mp4' ? 'video' : kind === 'gif' ? 'animated' : 'still', source: 'canva', canvaDesignId: designId,
    createdAt: now, createdBy: uid || '', updatedAt: now, updatedBy: uid || ''
  };
  await deps.db.collection('pictureLibrary').doc(id).set(doc);
  return Object.assign({ id }, doc);
}

export async function disconnect(deps) {
  const ref = deps.db.collection(TOKENS[0]).doc(TOKENS[1]);
  const d = await ref.get();
  if (d.exists && d.data().refresh) {
    /* Tell Canva too; if it fails, the hub forgets the tokens anyway. */
    await deps.fetchFn((deps.apiBase || API) + '/oauth/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(deps.clientId + ':' + deps.secret).toString('base64') },
      body: new URLSearchParams({ token: d.data().refresh }).toString()
    }).catch(() => null);
  }
  await ref.delete();
  return { connected: false };
}
