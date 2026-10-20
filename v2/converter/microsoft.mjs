/* ===================================================================
   EGBC Present - the Microsoft 365 route (F-252): the slides drawn by
   Microsoft's own PowerPoint, for a church that connects its Microsoft 365
   ===================================================================

   Microsoft Graph turns a PowerPoint into a PDF with PowerPoint's own
   renderer (GET .../content?format=pdf): Office's cloud fonts (Aptos),
   layouts, everything as PowerPoint draws it. The converter then makes the
   pictures from that PDF exactly as on the LibreOffice route. If this route
   is not set up, or Microsoft fails, LibreOffice does it (convert.mjs).

   msToPdf(cfg, pptxBuf, name) -> PDF Buffer
     1. a token for the app itself (client credentials; no person signs in)
     2. the deck up to the church's conversion folder (one PUT; a big deck
        in 60 MB pieces through an upload session)
     3. ?format=pdf - Microsoft draws it
     4. the copy deleted again (always; nothing is left in SharePoint)

   SET UP (Martin, once, in the church's Microsoft 365 - see FINDINGS F-252):
     MS_TENANT_ID      the church's Directory (tenant) ID
     MS_CLIENT_ID      the app's Application (client) ID
     MS_CLIENT_SECRET  its client secret (Secret Manager, never in a file)
     MS_SITE           the SharePoint site for conversions, as
                       "esherchurch.sharepoint.com:/sites/EGBCHub"
     MS_FOLDER         optional, the folder in its Documents
                       (default "Present conversions")
   The app needs only Graph's APPLICATION permission Sites.Selected, with
   "write" granted on that one site: it can touch nothing else.
   MS_GRAPH / MS_LOGIN: other addresses, for the tests' stand-in only.
   =================================================================== */
const CHUNK = 60 * 1024 * 1024;          /* a multiple of 320 KiB, as Graph asks */
const SIMPLE_MAX = 60 * 1024 * 1024;     /* one PUT up to here; Graph allows 250 MB */

export function msConfig(env = process.env) {
  if (!env.MS_TENANT_ID || !env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET || !env.MS_SITE) return null;
  return { tenant: env.MS_TENANT_ID, clientId: env.MS_CLIENT_ID, secret: env.MS_CLIENT_SECRET, site: env.MS_SITE.replace(/^https?:\/\//, ''),
    folder: env.MS_FOLDER || 'Present conversions', graph: (env.MS_GRAPH || 'https://graph.microsoft.com/v1.0').replace(/\/$/, ''),
    login: (env.MS_LOGIN || 'https://login.microsoftonline.com').replace(/\/$/, ''),
    simpleMax: +env.MS_SIMPLE_MAX || SIMPLE_MAX, chunk: +env.MS_CHUNK || CHUNK };
}

/* ONE Church HQ app for every church (F-253): the app's ID and secret are
   the converter's own (MS_CLIENT_ID, MS_CLIENT_SECRET); which church's
   Microsoft 365, and which site, come from that church's connection,
   privateSettings/microsoft365 (made by "Connect Microsoft 365",
   functions/microsoft.js). Not connected, or no app: null (LibreOffice). */
export async function msConfigFor(db, env = process.env) {
  if (!env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) return msConfig(env);
  const d = db ? await db.collection('privateSettings').doc('microsoft365').get().then((x) => (x.exists ? x.data() : null), () => null) : null;
  if (!d || !d.tenantId || !d.siteId) return msConfig(env);
  const c = msConfig(Object.assign({}, env, { MS_TENANT_ID: d.tenantId, MS_SITE: d.siteId }));
  c.siteId = d.siteId;
  return c;
}

let tok = null, site = null;
export function forgetMicrosoft() { tok = null; site = null; }
async function token(c) {
  if (tok && tok.key === c.tenant + c.clientId && tok.until > Date.now() + 120000) return tok.value;
  const r = await fetch(c.login + '/' + encodeURIComponent(c.tenant) + '/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Microsoft 365 would not sign the converter in (' + (j.error || r.status) + '). Check MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET.');
  tok = { key: c.tenant + c.clientId, value: j.access_token, until: Date.now() + (+j.expires_in || 3600) * 1000 };
  return tok.value;
}
async function graph(c, method, url, body, headers) {
  const t = await token(c);
  const r = await fetch(url.startsWith('http') ? url : c.graph + url, { method, body, headers: Object.assign({ Authorization: 'Bearer ' + t }, headers || {}) });
  return r;
}
async function siteId(c) {
  if (c.siteId) return c.siteId;
  if (site && site.key === c.site) return site.id;
  const [host, path] = c.site.split(':');
  const r = await graph(c, 'GET', '/sites/' + host + (path ? ':' + path.split('/').map(encodeURIComponent).join('/') : ''));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error('Microsoft 365: the site ' + c.site + ' could not be opened (' + r.status + '). Has the app been given "write" on it?');
  site = { key: c.site, id: j.id };
  return j.id;
}
const itemPath = (c, name) => '/root:/' + c.folder.split('/').map(encodeURIComponent).join('/') + '/' + encodeURIComponent(name) + ':';

export async function msToPdf(c, buf, name) {
  const sid = await siteId(c), base = '/sites/' + sid + '/drive';
  let item = null;
  try {
    if (buf.length <= (c.simpleMax || SIMPLE_MAX)) {
      const r = await graph(c, 'PUT', base + itemPath(c, name) + '/content', buf, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      item = await r.json().catch(() => ({}));
      if (!r.ok || !item.id) throw new Error('Microsoft 365 would not take the file (' + r.status + ').');
    } else {
      const s = await graph(c, 'POST', base + itemPath(c, name) + '/createUploadSession', JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }), { 'Content-Type': 'application/json' });
      const sj = await s.json().catch(() => ({}));
      if (!s.ok || !sj.uploadUrl) throw new Error('Microsoft 365 would not start the upload (' + s.status + ').');
      const piece = c.chunk || CHUNK;
      for (let at = 0; at < buf.length; at += piece) {
        const end = Math.min(buf.length, at + piece);
        /* the upload address carries its own permission: no Authorization header */
        const r = await fetch(sj.uploadUrl, { method: 'PUT', body: buf.subarray(at, end), headers: { 'Content-Range': 'bytes ' + at + '-' + (end - 1) + '/' + buf.length } });
        if (end === buf.length) { item = await r.json().catch(() => ({})); if (!r.ok || !item.id) throw new Error('Microsoft 365 did not finish the upload (' + r.status + ').'); }
        else if (!r.ok) throw new Error('Microsoft 365 stopped the upload (' + r.status + ').');
      }
    }
    const p = await graph(c, 'GET', base + '/items/' + encodeURIComponent(item.id) + '/content?format=pdf');
    if (!p.ok) throw new Error('Microsoft 365 could not draw the slides (' + p.status + ').');
    const pdf = Buffer.from(await p.arrayBuffer());
    if (pdf.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('Microsoft 365 did not send a PDF.');
    return pdf;
  } finally {
    if (item && item.id) await graph(c, 'DELETE', base + '/items/' + encodeURIComponent(item.id)).catch(() => {});
  }
}
