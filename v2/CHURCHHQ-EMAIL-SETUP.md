# Setting up Church HQ's email (Resend + Cloudflare): Martin's steps

One Resend account for **every** church on Church HQ. Each church's e-news
arrives as:

> **From:** Esher Green Baptist Church &lt;news@mail.churchhq.co.uk&gt;
> **Reply-To:** the church's own address (e.g. office@esherchurch.org)

You do the clicks. Nobody else needs your passwords. Allow about 30 minutes.
Do the steps in order and tick each one.

---

> **DONE, 19 Oct 2026 (Martin and the reviewing window): parts A, B and C.**
> - Resend account "churchhq"; domain `mail.churchhq.co.uk`, Ireland (eu-west-1), **Verified**.
> - Cloudflare records: see Part C (what is actually there).
> - The root's Cloudflare email routing is untouched.
> - **Still to do: parts D and E, Martin's, at switch-over.**
> - **esherchurch.org's DNS is NOT needed.** Every church sends from
>   mail.churchhq.co.uk. A church's own domain is only for a church that
>   later wants to send from its own address (see the end).

## Part A: the Resend account (DONE, 19 Oct 2026)

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

## Part B: add the sending address (DONE and VERIFIED, 19 Oct 2026)

- [ ] **B1.** In Resend, open **Domains** → **Add domain**.
- [ ] **B2.** Type exactly: `mail.churchhq.co.uk`
- [ ] **B3.** **Region:** choose **Ireland (eu-west-1)**, the closest to the UK.
- [ ] **B4.** If it asks about **open and click tracking**, leave both **off**.
      Tracking changes every link and marks who opened what. A church
      newsletter doesn't need that, and it can push emails into spam.
- [ ] **B5.** Press **Add**. Resend now shows a list of records for Part C.
      Leave the page open.

## Part C: the Cloudflare records (DONE and VERIFIED, 19 Oct 2026)

What is actually in Cloudflare for churchhq.co.uk. Resend now gives CNAMEs
for sending, not the SPF TXT this guide first said.

| Type | Name | Content | Priority | Proxy |
|---|---|---|---|---|
| **TXT** | `resend._domainkey.mail` | the DKIM key Resend gave (starts `p=`) | | DNS only |
| **CNAME** | `send.mail` | `send.forge.rmta.net` | | **DNS only** |
| **CNAME** | `rsend.mail` | `rsend-euw1.forge.rmta.net` | | **DNS only** |
| **MX** | `mail` | `inbound-smtp.eu-west-1.amazonaws.com` | `10` | |
| **TXT** | `_dmarc` (the root, so it covers `mail.` too) | `v=DMARC1; p=none;` | | |

In plain words:
- **DKIM (TXT)** is the signature that proves an email really came from us.
- **The two CNAMEs** let Resend send for mail.churchhq.co.uk and handle returned mail.
- **DMARC** tells Gmail and others what to do with fakes. `p=none` means "watch only" for now. After a month of clean sending it can become `p=quarantine`, a one-word edit.

Nothing more to do here.

## Part D: the key, into the key box (at switch-over; 5 min)

The key lets anyone send email as Church HQ, so it **never goes in a chat,
an email, a page or the repository**. You paste it into the hub's **key
box**, which hands it to the server and never shows it again.

**The box refuses until switch-over.** Until then the database can be read
by anybody, so a key saved now wouldn't be safe. The box just says so, and
there's nothing to do. On switch-over day, after the rules:

- [ ] **D1.** In Resend: **API Keys** → **Create API key**.
      - Name: `church-hq-hub`
      - Permission: **Sending access**
      - Domain: **mail.churchhq.co.uk**

      Press **Add**, then **copy** the key. It is shown only once.
- [ ] **D2.** In the hub: **Menu → Church settings → Email and Canva keys**
      (master admins only). Paste it into **Resend API key**, press **Save**.
      It says "Saved. It will not be shown again" and shows **saved** beside
      the name.
- [ ] **D3.** Close the Resend tab. The key isn't needed anywhere else.

Sending stays held until switch-over too: `ENEWS_LIVE = false` in
`functions/enews-gate.js`. On the emulator, nothing is ever really sent.

## Part E: bounces and complaints (at switch-over; 5 min)

- [ ] **E1.** Resend → **Webhooks** → **Add endpoint**. Paste:
      `https://europe-west2-egbc-worship-planner.cloudfunctions.net/hqMailEvents`
      Tick these events:
      - **email.bounced**
      - **email.complained**
      - **email.delivery_delayed**
      - **email.suppressed**
      - **email.failed**
- [ ] **E2.** Copy the **Signing secret** it shows (starts `whsec_`). Paste
      it into the key box's **Resend webhook signing secret**, then press **Save**.
- [ ] **E3. Switch click tracking OFF.** Resend switched it on for this
      domain. It can only be changed per domain, not per email, and the hub's
      key can only send, so this one is a click:
      Resend → **Domains** → **mail.churchhq.co.uk** → **Configuration** →
      tracking → **click tracking off** (and open tracking off).
      Tracking rewrites every link in the e-news and marks who opened what.
      A church e-news doesn't need that, and it can push emails into spam.

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
  an optional extra later. It's never needed. **That is the only time a
  church's own DNS (e.g. esherchurch.org's) is involved; nothing is needed
  there now.**

## If something goes wrong

- **Resend still says "Pending" after a day:** check each Name in
  Cloudflare has no `.churchhq.co.uk` typed twice, and that the DKIM line
  is **DNS only** (grey cloud, not orange).
- **You think the key has leaked:** Resend → API Keys → delete it, make a
  new one (D1), and run D2 again. Nothing else changes.
