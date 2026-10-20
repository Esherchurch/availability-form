/* ===================================================================
   EGBC Present - a OneDrive / SharePoint share link into the deck's
   source.pptx (F-251). Runs in the converter (Cloud Run, 4 GiB), not in a
   Cloud Function: a deck with a video can be 700 MB and more.
   ===================================================================

   fetchDeckToStorage({ url, file, max, allowLocal, onSize })
     -> { bytes }   the file streamed straight into Storage (never held
                    whole in memory); refused over `max` (1 GB) or when it
                    is not a PowerPoint (a zip: "PK").

   SharePoint / OneDrive for Business ("Can view" links, the church's own
   esherchurch-my.sharepoint.com): the link first sets a cookie (FedAuth),
   and the download (?download=1) is refused (403) without it. So the link
   is visited first, every Set-Cookie kept through the redirects, and the
   download made with them. Found on the church's own 729 MB deck (20 Oct).
   Personal OneDrive (1drv.ms, onedrive.live.com): the public shares API.
   =================================================================== */
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const LINK_MAX = 1024 * 1024 * 1024;

export function linkKind(url) {
  const u = String(url || '').trim();
  if (/^https:\/\/([\w-]+\.)*(1drv\.ms|onedrive\.live\.com)\//i.test(u)) return 'onedrive';
  if (/^https:\/\/[\w-]+(-my)?\.sharepoint\.com\//i.test(u)) return 'sharepoint';
  return '';
}

/* Follow redirects by hand, keeping every cookie (fetch keeps none). */
async function go(url, jar, method = 'GET') {
  let u = url;
  for (let hop = 0; hop < 12; hop++) {
    const r = await fetch(u, { method, redirect: 'manual', headers: { Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '), 'User-Agent': 'Mozilla/5.0 (EGBC Present converter)' } });
    for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) { const m = c.match(/^([^=;\s]+)=([^;]*)/); if (m) jar.set(m[1], m[2]); }
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) { await r.body?.cancel(); u = new URL(loc, u).toString(); continue; }
    return r;
  }
  throw new Error('That link goes round in circles.');
}

export async function fetchDeckToStorage({ url, file, max = LINK_MAX, allowLocal = false, onSize, kind: testKind }) {
  /* the tests' own local links may say which kind of share they stand in for */
  const u = String(url || '').trim(), local = allowLocal && /^http:\/\/localhost:\d+\//.test(u), kind = (local && testKind) || linkKind(u), jar = new Map();
  let res;
  if (local && !kind) res = await go(u, jar);
  else if (kind === 'onedrive') res = await go('https://api.onedrive.com/v1.0/shares/u!' + Buffer.from(u).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-') + '/root/content', jar);
  else if (kind === 'sharepoint') {
    const visit = await go(u, jar); await visit.body?.cancel();
    if (visit.status === 401 || visit.status === 403 || /login\.microsoftonline\.com/.test(visit.url || '')) throw new Error('That link is only for signed-in accounts. In OneDrive, Share and choose "Anyone with the link can view".');
    res = await go(u + (u.includes('?') ? '&' : '?') + 'download=1', jar);
  } else throw new Error('Paste a OneDrive or SharePoint link to the PowerPoint.');
  if (res.status === 401 || res.status === 403) { await res.body?.cancel(); throw new Error('That link is only for signed-in accounts. In OneDrive, Share and choose "Anyone with the link can view".'); }
  if (!res.ok || !res.body) { await res.body?.cancel(); throw new Error('The file could not be fetched (' + res.status + ').'); }
  const said = +res.headers.get('content-length') || 0;
  if (said > max) { await res.body.cancel(); throw new Error('That PowerPoint is ' + Math.round(said / 1048576) + ' MB; the most is ' + Math.round(max / 1048576) + ' MB.'); }
  if (onSize && said) onSize(said);
  let bytes = 0, head = Buffer.alloc(0);
  const check = new Transform({
    transform(chunk, enc, cb) {
      bytes += chunk.length;
      if (head.length < 2) { head = Buffer.concat([head, chunk]).slice(0, 2); if (head.length === 2 && head.toString('latin1') !== 'PK') return cb(new Error('That link is not a PowerPoint file. In OneDrive, Share and choose "Anyone with the link can view".')); }
      if (bytes > max) return cb(new Error('That PowerPoint is over ' + Math.round(max / 1048576) + ' MB.'));
      cb(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(res.body), check, file.createWriteStream({ resumable: bytes > 5e6 || said > 5e6, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
  if (bytes < 2) throw new Error('That link gave an empty file.');
  return { bytes };
}
