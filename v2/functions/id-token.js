/* The hub's own emails carry the server's Google identity (NEXT-BRIEF §26
 * item 4b). sendEmail (Calla's) accepts a Google identity token for its own
 * address from the hub's runtime account,
 * 199442060489-compute@developer.gserviceaccount.com, and on switch-over day
 * stops accepting anything else.
 *
 * A FAILURE TO GET A TOKEN SENDS WITHOUT ONE, rather than not at all. Until
 * switch-over the old open way still delivers, and after it the refusal is
 * recorded in emailOutbox, where somebody can see it. Not sending at all
 * would lose the message quietly.
 */
export async function emailAuthHeader(getClient) {
  try {
    const client = await getClient();
    const h = await client.getRequestHeaders();
    /* google-auth-library 10 and later hand back a Headers object; older
       ones a plain object. Either. */
    const v = h && (typeof h.get === 'function' ? (h.get('authorization') || h.get('Authorization'))
      : (h.Authorization || h.authorization));
    return v ? { Authorization: String(v) } : {};
  } catch (e) {
    console.warn('[sendEmail] no Google identity token, sending without:', (e && e.message) || e);
    return {};
  }
}

/* One client per instance, made when first needed: on the emulator it is
   never asked for, because nothing is sent from the emulator. */
let client = null;
export function idTokenClient(audience) {
  return async () => {
    if (!client) {
      const { GoogleAuth } = await import('google-auth-library');
      client = await new GoogleAuth().getIdTokenClient(audience);
    }
    return client;
  };
}
