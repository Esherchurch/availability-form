/* ===================================================================
   CONNECT MICROSOFT 365 (F-253): one Church HQ app for every church
   ===================================================================

   Present's slides are drawn by Microsoft's own PowerPoint when the church
   has connected its Microsoft 365 (converter/microsoft.mjs); LibreOffice
   otherwise. Martin registers ONE multi-tenant app, once ("Church HQ
   slides"). A church's Microsoft 365 admin, who is a master admin here,
   presses "Connect Microsoft 365" in Church settings:

     m365Start      callable (master admins): the address of Microsoft's
                    admin-consent screen for this church
     m365Callback   Microsoft comes back here, twice:
                    1. admin consent given -> the church's tenant ID; then
                       a one-off sign-in as that admin
                    2. with that sign-in, the app is given "write" on ONE
                       site (the church's root SharePoint site) - checked at
                       once with the app's own token - and the sign-in's
                       token is thrown away. Saved: privateSettings/
                       microsoft365 { tenantId, siteId, siteUrl, domain,
                       connectedBy, connectedAt } (no page reads it; no
                       secret is in it).
     m365Status     callable (master admins): connected or not, which site
     m365Disconnect callable (master admins): forget the connection

   PERMISSIONS (least privilege): the app's lasting right is Graph's
   APPLICATION permission Sites.Selected - no site at all until a site is
   granted, then only that site. Granting needs Sites.FullControl.All, which
   is asked for as a DELEGATED permission and used once, with the admin
   present, for that one call; nothing keeps it. The admin may remove it
   afterwards (Entra > Enterprise applications > Church HQ slides >
   Permissions) and conversion carries on.

   HQ app: MS_HQ_CLIENT_ID (param) and MS_HQ_CLIENT_SECRET (secret).
   On the emulator: presentSettings/test { msLogin, msGraph, msClientId,
   msClientSecret, returnBase } point at the tests' stand-in for Microsoft.
   =================================================================== */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import { hubAddressOf } from './hub-address.js';
import { churchOf, scopedDb } from './church-scope.js';

const REGION = 'europe-west2';
const EMULATOR = !!process.env.FUNCTIONS_EMULATOR;
const db = () => getFirestore();
export const MS_HQ_CLIENT_ID = defineString('MS_HQ_CLIENT_ID', { default: '' });
export const MS_HQ_CLIENT_SECRET = defineSecret('MS_HQ_CLIENT_SECRET');
/* Where Microsoft sends people back to: the church's own hub (hubAddressOf), found from the state. */
const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const APP_NAME = 'Church HQ slides';
/* A placeholder is not a secret: the reviewer set MS_HQ_CLIENT_SECRET to
   "NOT-SET" so deploys could run (21 Oct). NOT-SET or empty = not set up yet. */
export const real = (v) => { const t = String(v == null ? '' : v).trim(); return t && t.toUpperCase() !== 'NOT-SET' ? t : ''; };

async function settings() {
  if (EMULATOR) {
    const t = (await db().collection('presentSettings').doc('test').get().catch(() => null));
    const x = t && t.exists ? t.data() : {};
    return { login: x.msLogin || '', graph: x.msGraph || '', clientId: real(x.msClientId), secret: real(x.msClientSecret), back: x.returnBase || 'http://localhost:5601/',
      callback: 'http://127.0.0.1:' + (process.env.FUNCTIONS_EMULATOR_PORT || '5102') + '/' + PROJECT + '/' + REGION + '/m365Callback' };
  }
  let secret = ''; try { secret = real(MS_HQ_CLIENT_SECRET.value()); } catch (e) {}
  return { login: 'https://login.microsoftonline.com', graph: 'https://graph.microsoft.com/v1.0', clientId: real(MS_HQ_CLIENT_ID.value()), secret, back: '',
    callback: 'https://' + REGION + '-' + PROJECT + '.cloudfunctions.net/m365Callback' };
}
/* Each church connects its own Microsoft 365: its master admins, its own
   privateSettings. The caller's church comes from their sign-in. */
async function master(D, uid) {
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  const u = (await D.collection('users').doc(uid).get()).data() || {};
  if (u.status !== 'active' || u.masterAdmin !== true) throw new HttpsError('permission-denied', 'Only a master admin can connect Microsoft 365.');
  return u;
}

export const m365Start = onCall({ region: REGION, secrets: [MS_HQ_CLIENT_SECRET] }, async (req) => {
  const D = churchOf(req, db()).db;
  const u = await master(D, req.auth && req.auth.uid), s = await settings();
  if (!s.clientId || !s.secret) throw new HttpsError('failed-precondition', 'Microsoft 365 isn’t set up yet: Church HQ hasn’t finished setting up its app. Until then Present draws PowerPoint slides itself.');
  const state = crypto.randomBytes(24).toString('hex');
  /* At the top level, server-only: Microsoft brings back only the state, so it says which church. */
  await db().collection('m365Connect').doc(state).set({ uid: req.auth.uid, name: u.name || '', churchId: D.churchId || '', step: 'consent', at: Date.now() });
  const q = new URLSearchParams({ client_id: s.clientId, scope: 'https://graph.microsoft.com/.default', redirect_uri: s.callback, state });
  return { url: s.login + '/organizations/v2.0/adminconsent?' + q.toString() };
});

/* The plain words a church sees when something goes wrong */
function why(e) { return String((e && e.message) || e || 'Something went wrong.').slice(0, 300); }

export const m365Callback = onRequest({ region: REGION, secrets: [MS_HQ_CLIENT_SECRET] }, async (req, res) => {
  const s = await settings(), p = req.query || {};
  const ref = p.state && /^[a-f0-9]{48}$/.test(String(p.state)) ? db().collection('m365Connect').doc(String(p.state)) : null;
  const st = ref ? (await ref.get()).data() : null;
  const D = scopedDb(db(), (st && st.churchId) || null);
  /* back to the church's own hub (the tests' stand-in on the emulator) */
  const home = s.back || (await hubAddressOf(D)).url;
  const back = (ok, words) => res.redirect(302, home + 'church-settings.html?m365=' + (ok ? 'connected' : 'failed') + (words ? '&why=' + encodeURIComponent(words) : '') + '#m365');
  if (!st || Date.now() - st.at > 15 * 60 * 1000) return back(false, 'That took too long or did not start here. Press "Connect Microsoft 365" again.');
  try {
    if (p.error) throw new Error(p.error === 'access_denied' ? 'Microsoft 365 was not connected: the permission was declined.' : String(p.error_description || p.error));
    if (st.step === 'consent') {
      if (String(p.admin_consent).toLowerCase() !== 'true' || !/^[0-9a-f-]{36}$/i.test(String(p.tenant || ''))) throw new Error('Microsoft did not confirm the consent.');
      await ref.update({ step: 'grant', tenant: String(p.tenant), at: Date.now() });
      const q = new URLSearchParams({ client_id: s.clientId, response_type: 'code', redirect_uri: s.callback, response_mode: 'query', scope: 'https://graph.microsoft.com/Sites.FullControl.All', state: String(p.state), prompt: 'select_account' });
      return res.redirect(302, s.login + '/' + encodeURIComponent(st.tenant || String(p.tenant)) + '/oauth2/v2.0/authorize?' + q.toString());
    }
    if (st.step !== 'grant' || !p.code) throw new Error('Microsoft did not send the sign-in back.');
    /* the admin's sign-in, used once, for the one grant */
    const t = await fetch(s.login + '/' + encodeURIComponent(st.tenant) + '/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: s.clientId, client_secret: s.secret, grant_type: 'authorization_code', code: String(p.code), redirect_uri: s.callback, scope: 'https://graph.microsoft.com/Sites.FullControl.All' }) });
    const tj = await t.json().catch(() => ({}));
    if (!t.ok || !tj.access_token) throw new Error('Microsoft would not complete the sign-in (' + (tj.error || t.status) + ').');
    const auth = { Authorization: 'Bearer ' + tj.access_token };
    const sr = await fetch(s.graph + '/sites/root', { headers: auth }), site = await sr.json().catch(() => ({}));
    if (!sr.ok || !site.id) throw new Error('The church’s SharePoint could not be opened (' + sr.status + ').');
    const g = await fetch(s.graph + '/sites/' + encodeURIComponent(site.id) + '/permissions', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({ roles: ['write'], grantedToIdentities: [{ application: { id: s.clientId, displayName: APP_NAME } }] }) });
    if (!g.ok) throw new Error(g.status === 403 ? 'The person who signed in must be a Global or SharePoint administrator of the church’s Microsoft 365.' : 'The site permission could not be given (' + g.status + ').');
    /* proved with the app's own token, as the converter will use it */
    const a = await fetch(s.login + '/' + encodeURIComponent(st.tenant) + '/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: s.clientId, client_secret: s.secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }) });
    const aj = await a.json().catch(() => ({}));
    const check = aj.access_token ? await fetch(s.graph + '/sites/' + encodeURIComponent(site.id), { headers: { Authorization: 'Bearer ' + aj.access_token } }) : { ok: false, status: a.status };
    if (!check.ok) throw new Error('Connected, but the app cannot reach the site yet (' + check.status + '). Wait a minute and press Connect again.');
    const host = (site.siteCollection && site.siteCollection.hostname) || String(site.webUrl || '').replace(/^https?:\/\//, '').split('/')[0];
    await D.collection('privateSettings').doc('microsoft365').set({ tenantId: st.tenant, siteId: site.id, siteUrl: String(site.webUrl || ''), domain: host,
      connectedBy: st.uid, connectedByName: st.name || '', connectedAt: new Date().toISOString() });
    await ref.delete();
    return back(true);
  } catch (e) {
    await ref.delete().catch(() => {});
    return back(false, why(e));
  }
});

export const m365Status = onCall({ region: REGION, secrets: [MS_HQ_CLIENT_SECRET] }, async (req) => {
  const D = churchOf(req, db()).db;
  await master(D, req.auth && req.auth.uid);
  const d = (await D.collection('privateSettings').doc('microsoft365').get()).data();
  const s = await settings();
  return d ? { connected: true, available: !!(s.clientId && s.secret), domain: d.domain || '', siteUrl: d.siteUrl || '', by: d.connectedByName || '', at: d.connectedAt || '' }
    : { connected: false, available: !!(s.clientId && s.secret) };
});

export const m365Disconnect = onCall({ region: REGION }, async (req) => {
  const D = churchOf(req, db()).db;
  await master(D, req.auth && req.auth.uid);
  await D.collection('privateSettings').doc('microsoft365').delete();
  return { ok: true };
});
