# egbc.churchhq.co.uk — Church HQ's own address for v2

A Cloudflare Worker (`worker.js`) serves v2, and only v2, at
**https://egbc.churchhq.co.uk**:
`egbc.churchhq.co.uk/<page>` is `esherchurch.github.io/availability-form/v2/<page>`, and `/` is v2's start page.

- **The original site is not touched.** Nothing in GitHub changes. The Worker never reaches anything above `v2/`. It is **not** a GitHub Pages custom domain, because that would move the whole repo, the original site with it.
- **The github.io addresses keep working,** v2's included. Nothing redirects.
- **Sign-in** runs through the new address: the Worker passes `/__/auth/` on to `egbc-worship-planner.firebaseapp.com`, and on this address `egbc-auth.js` uses it as the sign-in domain.
- **Checked locally** by `tests/check-worker.mjs` (the real Worker code, a stand-in for github.io, the emulators).

## What Martin does, in order

### 1. Cloudflare (Martin's account; churchhq.co.uk is already there)

1. **Workers & Pages → Create → Worker.** Name it `churchhq-hub`. Paste in the whole of `worker.js` and press **Deploy**.
2. In that Worker: **Settings → Domains & Routes → Add → Custom domain** → `egbc.churchhq.co.uk`. Cloudflare makes the DNS record itself (a proxied record for `egbc`). If it asks, say yes.
   - If you'd rather do it by hand: **DNS → Add record**: type `AAAA`, name `egbc`, content `100::`, **Proxied** (orange cloud). Then in the Worker, **Add → Route** `egbc.churchhq.co.uk/*`, zone `churchhq.co.uk`.
3. Open https://egbc.churchhq.co.uk/hub.html. It should look exactly like the github.io v2 hub. You can't sign in until step 2 below is done.

### 2. Firebase (console.firebase.google.com → egbc-worship-planner)

1. **Authentication → Settings → Authorised domains → Add domain:** `egbc.churchhq.co.uk`.

### 3. Google Cloud (console.cloud.google.com → project egbc-worship-planner)

1. **APIs & Services → Credentials → OAuth 2.0 Client IDs →** the "Web client (auto created by Google Service)" one. Under **Authorised redirect URIs, add** `https://egbc.churchhq.co.uk/__/auth/handler`. Under **Authorised JavaScript origins, add** `https://egbc.churchhq.co.uk`. Save.
2. **APIs & Services → Credentials → API keys →** the "Browser key" used by the hub (it starts `AIzaSyCl2en…`). **If** it has **Website restrictions**, add `https://egbc.churchhq.co.uk/*`. If it says "None", leave it.

### 4. Microsoft (Azure, the app under hello@churchhq.co.uk)

**Nothing to add.** Microsoft sends people back to the server's own address (`…cloudfunctions.net/m365Callback`), which doesn't change. The server then sends them on to the hub.

### 5. Try it (Martin)

On a phone and a computer, at **https://egbc.churchhq.co.uk**:
1. Sign in with Google.
2. Open the worship rota and the Kids Church rota (the app: Worship → Rota; Kids Church → Rota).
3. Turn on the calendar feed (Me → Calendar).

Installed apps and notifications belong to the address they were set up from. To use the new address, install the app again and turn notifications on again from egbc.churchhq.co.uk. The github.io ones keep working until you remove them.

### 6. Then the emails (the reviewing window: one line and a deploy) — done 26 Oct 2026, cce1784c

Once step 5 works, emails and links should use the new address:
1. In `functions/hub-address.js`, change the one line to
   `export const EGBC_HUB = 'https://egbc.churchhq.co.uk/';`
2. Deploy the functions (the reviewing window).

Old github.io links in emails already sent keep working.

## Later: every church

Each church gets `<its short name>.churchhq.co.uk` (`functions/hub-address.js`).

1. **Cloudflare:** change the route to `*.churchhq.co.uk/*`. Make a KV namespace, bind it as `SLUGS` (see `wrangler.toml`), and add each church's short name → church id.
2. **Firebase:** authorise each church's address (Firebase has no wildcard).
3. **Google Cloud:** add each church's `/__/auth/handler` address.

The Worker serves the same v2 to every church. The church comes from the person's sign-in.
