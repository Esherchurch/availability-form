/* ===================================================================
   ONE LONG REQUEST to the converter (F-259)
   ===================================================================
   A deck with a long video takes more than 5 minutes (the light copy for
   phones). Node's fetch (undici) - and google-auth-library 11, which uses
   it - stops waiting for the reply's headers at 300 s ("fetch failed"),
   whatever timeout is asked for; Cloud Run lets the converter run 900 s.
   Deploy day, 21 Oct: the smoke tool gave up at 302 s, cleaned up, and the
   converter, finishing at 323 s, found its deck gone and answered 422.

   postJson(url, body, { headers, timeoutMs }) -> { status, json }
   Plain node:http(s): no header or body timeout of its own, only ours
   (default 960 s, a little past Cloud Run's 900). Used by the hub's
   functions (present.js) and by tools/converter-smoke.mjs.
   =================================================================== */
import http from 'node:http';
import https from 'node:https';

export function postJson(url, body, { headers = {}, timeoutMs = 960000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), data = Buffer.from(JSON.stringify(body || {}));
    const req = (u.protocol === 'https:' ? https : http).request(u, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': data.length }, headers) }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => { const text = Buffer.concat(parts).toString('utf8'); let json = {}; try { json = JSON.parse(text || '{}'); } catch (e) { json = { error: text.slice(0, 300) }; } clearTimeout(timer); resolve({ status: res.statusCode, json }); });
      res.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    const timer = setTimeout(() => req.destroy(new Error('No reply from the converter after ' + Math.round(timeoutMs / 1000) + ' s.')), timeoutMs);
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.end(data);
  });
}
