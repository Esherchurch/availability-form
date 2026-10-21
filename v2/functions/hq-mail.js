/* ===================================================================
   Church HQ's own sending: Resend, from mail.churchhq.co.uk
   ===================================================================

   Decided 19 Oct 2026 (FINDINGS-comms, decision 2): ONE Church HQ Resend
   account for every church. Each church sends as
       "<Church name>" <news@mail.churchhq.co.uk>
   with Reply-To set to the church's own address, so replies go to the
   church, never to Church HQ. Martin's setup steps: CHURCHHQ-EMAIL-SETUP.md.

   The e-news, its test and the welcome emails use this sender (one person
   each, with their own unsubscribe header); every other email goes through
   public-mail.js makeSender, which uses the same Resend (mail-route.js).
   Calla's sendEmail is not used at all (Martin, 21 Oct 2026).

     makeHqSender({ db })  -> send(msg, meta)
        msg:  { to, subject, html, fromName, replyTo, headers, tags,
                idempotencyKey }
        meta: written to the emailOutbox row (kind, issueId ...)
     verifySvix(secret, headers, rawBody)   Resend's webhook signature

   THE KEY: Google Secret Manager, HQ_RESEND_API_KEY (resend-secrets.js),
   read here on the server only. Never in the database, a page, a chat or
   the repository.

   THE OUTBOX keeps when, who, the subject and whether it went - not the
   e-news itself (the issue holds that), so a weekly send to hundreds
   does not copy the whole email hundreds of times.
   =================================================================== */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { resendKey } from './resend-secrets.js';

export const SENDING_DOMAIN = 'mail.churchhq.co.uk';
const API = 'https://api.resend.com/emails';
const onEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';


/* The name in "From": the church's, with anything that could break the
   header taken out. */
export function fromFor(name, local) {
  const clean = String(name || '').replace(/["<>\r\n\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return (clean ? '"' + clean + '" ' : '') + '<' + (local === 'hub' ? 'hub' : 'news') + '@' + SENDING_DOMAIN + '>';
}
/* Resend tags allow letters, numbers, _ and - only. */
const tagValue = v => String(v || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);

export function makeHqSender({ db, emulator = onEmulator, fetchFn, key } = {}) {
  return async function send(msg, meta = {}) {
    const to = String(msg.to || '').trim();
    const row = {
      to: to ? [to] : [], subject: String(msg.subject || '').slice(0, 300), replyTo: msg.replyTo || '',
      html: '', via: 'churchhq', ...meta, at: new Date().toISOString(), stubbed: emulator()
    };
    if (!to) { await db.collection('emailOutbox').add({ ...row, ok: false, error: 'no address' }); return { ok: false, error: 'no address' }; }
    if (emulator()) {
      /* The emulator never sends. The row keeps the headers, so a check can
         see the unsubscribe header was there. */
      await db.collection('emailOutbox').add({ ...row, ok: true, from: fromFor(msg.fromName), headers: msg.headers || {}, htmlForTest: String(msg.html || '').slice(0, 200000) });
      return { ok: true, stubbed: true };
    }
    let out;
    try {
      const k = key || (await resendKey()) || '';
      if (!k) throw new Error('no Resend key yet: HQ_RESEND_API_KEY in Google Secret Manager');
      const body = { from: fromFor(msg.fromName), to: [to], subject: row.subject, html: String(msg.html || '') };
      if (msg.replyTo) body.reply_to = msg.replyTo;
      if (msg.headers && Object.keys(msg.headers).length) body.headers = msg.headers;
      if (msg.tags) body.tags = Object.entries(msg.tags).map(([name, value]) => ({ name: tagValue(name), value: tagValue(value) }));
      const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k };
      if (msg.idempotencyKey) h['Idempotency-Key'] = String(msg.idempotencyKey).slice(0, 256);
      const r = await (fetchFn || fetch)(API, { method: 'POST', headers: h, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      out = r.ok && j && j.id ? { ok: true, id: j.id } : { ok: false, error: (j && (j.message || j.name)) || ('HTTP ' + r.status) };
    } catch (e) {
      out = { ok: false, error: e.message || String(e) };
    }
    await db.collection('emailOutbox').add({ ...row, ok: out.ok, error: out.error || '', resendId: out.id || '' });
    return out;
  };
}

/* Resend signs its webhooks the Svix way: HMAC-SHA256, keyed with the
   base64 part of whsec_..., over "<svix-id>.<svix-timestamp>.<raw body>";
   svix-signature holds one or more "v1,<base64>". A timestamp more than
   five minutes off is refused, so an old message cannot be replayed. */
export function verifySvix(secret, headers, raw, now = Date.now()) {
  const get = n => headers[n] || headers[n.toLowerCase()] || '';
  const id = get('svix-id'), ts = get('svix-timestamp'), sig = get('svix-signature');
  if (!secret || !id || !ts || !sig) return false;
  if (!/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  let keyBytes;
  try { keyBytes = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64'); } catch { return false; }
  const want = createHmac('sha256', keyBytes).update(id + '.' + ts + '.' + raw).digest();
  return String(sig).split(' ').some(part => {
    const [v, b64] = part.split(',');
    if (v !== 'v1' || !b64) return false;
    let got; try { got = Buffer.from(b64, 'base64'); } catch { return false; }
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
