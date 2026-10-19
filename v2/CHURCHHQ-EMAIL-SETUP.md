# Setting up Church HQ's email (Resend + Cloudflare): Martin's steps

One Resend account for **every** church on Church HQ. Each church's e-news
arrives as:

> **From:** Esher Green Baptist Church &lt;news@mail.churchhq.co.uk&gt;
> **Reply-To:** the church's own address (e.g. office@esherchurch.org)

You do the clicks. Nobody else needs your passwords. Allow about 30 minutes.
Do the steps in order and tick each one.

---

## Part A: the Resend account (10 min)

- [ ] **A1.** Go to **resend.com** and choose **Sign up**. Use a Church HQ email
      address you'll keep (not a personal one), and a strong password.
- [ ] **A2.** Turn on two-step sign-in: your picture (top right) → **Settings**
      → **Security** → **Two-factor authentication**.
- [ ] **A3.** Choose a plan: **Settings** → **Billing**.
      - The **free** plan sends at most **100 emails a day**. One e-news to
        400 people would stop a quarter of the way through.
      - So pick **Pro** (about $20 a month for up to 50,000 emails a month,
        with no daily limit). That covers many churches' weekly e-news.
        This is the cost to build into the Church HQ subscription.

## Part B: add the sending address (5 min)

- [ ] **B1.** In Resend, open **Domains** → **Add domain**.
- [ ] **B2.** Type exactly: `mail.churchhq.co.uk`
- [ ] **B3.** **Region:** choose **Ireland (eu-west-1)**, the closest to the UK.
- [ ] **B4.** If it asks about **open and click tracking**, leave both **off**.
      Tracking changes every link and marks who opened what. A church
      newsletter doesn't need that, and it can push emails into spam.
- [ ] **B5.** Press **Add**. Resend now shows a list of records for Part C.
      Leave the page open.

## Part C: the Cloudflare records (10 min)

**The easy way (try this first):**

- [ ] **C1.** On the Resend domain page, press **Sign in to Cloudflare**. Sign
      in, choose **churchhq.co.uk**, and press **Authorize**. Resend adds
      the records itself. Then go to **C6**.

**By hand, if the easy way isn't offered or fails:**

- [ ] **C2.** In another tab: **dash.cloudflare.com** → **churchhq.co.uk** →
      **DNS** → **Records** → **Add record**, once for each line below.
      Copy the **values** from the Resend page; they're unique to us.
      In the **Name** box, type only what's shown below. Cloudflare adds
      `.churchhq.co.uk` itself.

| # | Type | Name | Content / value | Priority | Proxy |
|---|---|---|---|---|---|
| C3 | **MX** | `send.mail` | the MX value Resend shows (looks like `feedback-smtp.eu-west-1.amazonses.com`) | `10` | (MX has none) |
| C4 | **TXT** | `send.mail` | `v=spf1 include:amazonses.com ~all` (as Resend shows it) | | **DNS only** (grey cloud) |
| C5 | **TXT** | `resend._domainkey.mail` | the long value Resend shows, starting `p=` | | **DNS only** (grey cloud) |

In plain words:
- **C3/C4 (SPF)** say "Resend is allowed to send for mail.churchhq.co.uk", and give returned mail somewhere to go.
- **C5 (DKIM)** is the signature that proves an email really came from us.

- [ ] **C6. DMARC** (tells Gmail and others what to do with fakes). Add one more:

| Type | Name | Content | Proxy |
|---|---|---|---|
| **TXT** | `_dmarc.mail` | `v=DMARC1; p=none; rua=mailto:dmarc@churchhq.co.uk` | DNS only |

  - If churchhq.co.uk has no `dmarc@` mailbox: in Cloudflare, use the left
    menu **Email** → **DMARC Management** → **Enable**. Cloudflare gives you
    its own `rua` address to paste in place of `mailto:dmarc@…`, and shows
    the reports as charts. Free.
  - `p=none` means "watch only" for now. After a month of clean reports we
    can change it to `p=quarantine`. That's a one-word edit, and I'll remind
    you.
  - **Don't change** any existing `_dmarc` record on churchhq.co.uk itself.
    This one only covers `mail.`.

- [ ] **C7.** Back in Resend, press **Verify DNS Records**. It usually turns
      green within minutes; it can take up to 72 hours. All lines should say
      **Verified**.

## Part D: the key, kept on the server (5 min)

The key lets anyone send email as Church HQ, so it **never goes in a page,
an email, a chat or the repository**. It goes straight into Google's secret
store from your own computer.

- [ ] **D1.** In Resend: **API Keys** → **Create API key**.
      - Name: `church-hq-hub`
      - Permission: **Sending access**
      - Domain: **mail.churchhq.co.uk**

      Press **Add**, then **copy** the key. It is shown only once.
- [ ] **D2.** On your PC, in the `v2` folder, run:
      ```
      firebase functions:secrets:set RESEND_API_KEY
      ```
      When it asks, paste the key and press Enter. Nothing shows on screen
      while you paste; that's normal.
- [ ] **D3.** Close the Resend tab. The key isn't needed anywhere else.

**Held until switch-over:** the hub's sending code has a switch
(`functions/enews-gate.js`, `ENEWS_LIVE = false`). Until it's turned on
at switch-over, the live functions won't send an e-news even though the
key is there. On the emulator, nothing is ever really sent.

## Part E: bounces and complaints (after the first deploy; 5 min)

This step needs the hub's address for receiving Resend's reports. That
address only exists after the reviewing window deploys `functions:hub` with
the e-news code. I'll give you the exact address then.

- [ ] **E1.** Resend → **Webhooks** → **Add endpoint**. Paste the address I give you.
      Tick these events:
      - **email.bounced**
      - **email.complained**
      - **email.delivery_delayed**
      - **email.suppressed**
      - **email.failed**
- [ ] **E2.** Copy the **Signing secret** it shows (starts `whsec_`). Then in `v2`:
      ```
      firebase functions:secrets:set RESEND_WEBHOOK_SECRET
      ```
      Paste it and press Enter.

Then a bounced address is marked "bounced" for **that church only**, and is
never sent to again. Someone who presses "spam" is unsubscribed from that
church's e-news.

---

## What happens for each church

- **The name** in "From" is the church's name from Church settings. The
  **Reply-To** is the church's own email, so replies reach the church office,
  never Church HQ.
- **One-click unsubscribe** is built into every e-news: a link at the
  bottom, and the "Unsubscribe" button Gmail and Apple Mail show at the
  top. It unsubscribes the person from that church's e-news only.
- **A church's own domain** (e.g. sending as news@esherchurch.org) can be
  an optional extra later. It's never needed.

## If something goes wrong

- **Resend still says "Pending" after a day:** check each Name in
  Cloudflare has no `.churchhq.co.uk` typed twice, and that the DKIM line
  is **DNS only** (grey cloud, not orange).
- **You think the key has leaked:** Resend → API Keys → delete it, make a
  new one (D1), and run D2 again. Nothing else changes.
