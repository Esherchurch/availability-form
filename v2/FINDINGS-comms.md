# FINDINGS-comms: the e-news, Val's card maker and Canva (comms window)

Started 19 Oct 2026 from Martin's brief. **This is the plan only. Nothing is built yet and no app page has changed.**
Feature names: `enews`, `cardMaker`, `canva`. All three stay **off** until Martin turns them on.

---

## DECIDED (19 Oct 2026; plan bebcbd9e accepted by the reviewing window and Martin)

These replace anything below that disagrees.

1. **The e-news is a new page** that shares the Email Compiler's blocks.
2. **Sending is one Church HQ Resend account for every church.**
   - Martin sets it up and pays for it inside the subscription.
   - Each church sends as `"<Church name>" <news@mail.churchhq.co.uk>`, with Reply-To set to the church's own address.
   - Unsubscribe, bounces and complaints are handled **per church**.
   - A church's own domain is an optional extra later, never required.
   - Martin's steps are in `CHURCHHQ-EMAIL-SETUP.md`.
   - **Updated 19 Oct:** the key goes into the **key box** in Church settings. Martin pastes it there himself. It is kept in `privateSettings/churchHqMail`, which no page can read, and is never shown again (`functions/hq-mail-key.js`). Sending is held by `functions/enews-gate.js` (`ENEWS_LIVE = false`) until switch-over.
   - The unsubscribe header and bounce handling live in the **hub's own** sending path, not Calla's.
   - **This replaces C-2, C-12 and C-13 below.** Calla's sendEmail is not changed for the e-news.
3. **Canva is tested on Martin's own FREE Canva account.**
   - The page shows "Connect Canva" and Martin signs in himself. Nobody asks for a password.
   - **No Autofill**: Canva's docs contradict each other on which plan it needs.
   - The fallback is download from Canva, then drag in.
   - What a free account can do is in C-21.
4. **Both looks as templates** (the Mailchimp look and the hub's green). The colours are a **church setting**, so any church can set its own.
5. **A new hub card maker.** Calla Design's files are not touched.
6. **Build and test now.** Running alongside Mailchimp starts on switch-over day (C-1).

### C-20. Moving hub email off Calla's sendEmail, later (plan; e-news first)

- **Stage 1 (now): the e-news only.**
  - A new hub module, `functions/hq-mail.js`, sends through Church HQ's Resend with the key from the key box.
  - It has `List-Unsubscribe` and `List-Unsubscribe-Post` headers, a `tags` entry carrying the church id and subscriber id (so a bounce report knows whose it is), and an `Idempotency-Key` per person per issue (so a retry never sends twice).
  - It writes the same `emailOutbox` rows as `makeSender` does today, so "Emails sent" (comms.html) shows e-news sends too.
  - A webhook function, `hqMailEvents`, checks Resend's signature (svix, raw body) and ignores repeats (`svix-id`). It then marks that church's subscriber `bounced` or `complained`.
- **Stage 2 (after switch-over, Martin decides when): the server's own emails.**
  - These are the reminders, notifications, public-page mail (§26 item 14) and `compilerSend`. Each moves from `makeSender` to `hq-mail.js`, one at a time.
  - `makeSender` gets the same shape so each move is a one-line change, with a check for each.
  - Transactional mail has **no** unsubscribe header, but still the church's name and Reply-To.
- **Stage 3: the browser senders.**
  - `egbc-email.js` (rotas, Planner, Sunday plans) today posts straight to Calla's sendEmail.
  - These move to a hub callable that checks who's signed in, then sends through `hq-mail.js`. That also closes the email lock (§26 item 4).
- **Calla's sendEmail keeps working throughout.** It's retired only when nothing calls it: check `emailOutbox` and Calla's logs for 4 weeks of silence.
- **Rotas and the rest stay on Calla's for now**, as Martin said.

### C-21. Canva on a FREE account (what to expect; Martin's test confirms)

| Part | Free account? | Source |
|---|---|---|
| Making the integration (Developer Portal) | Yes. Any account can, but **two-step sign-in must be on** for the REST APIs. | canva.dev authentication docs (the research's reading) |
| Using it before Canva reviews it | **Very likely yes, for the account that made it.** Canva's own quickstart has you sign in to your unreviewed integration on your own account. Others can't use it until reviewed. | canva.dev/docs/connect/quickstart |
| A **private** (our-church-only) integration | **No.** Enterprise only. So it's a "public" integration we never submit for review while only Martin and Val use it. If Val needs it on her own account, it's submitted then. | canva.dev creating-integrations |
| List your designs | Yes | List designs API, no plan noted |
| Export PNG, JPG, PDF | Yes | Export API |
| Export **GIF** and **MP4** | Yes. Not limited to Pro. A design with **paid (Pro) elements** may refuse to export at top quality ("license_required"). | Export API |
| Bigger-than-design exports | Limited on free (×1.125) | Export API |
| Autofill and brand templates | Not planned (decision 3) | |

**Martin's test, when the page is ready:**
1. Turn on two-step sign-in in Canva.
2. Make the integration in the Developer Portal. I'll write those clicks then, with the exact redirect address.
3. Open the hub page and press "Connect Canva".
4. Sign in to Canva yourself.
5. Check that your designs appear.
6. Import one animated design.

That one test answers every "very likely" above.

---

## DECIDED, 19 Oct 2026 late (Martin and the reviewing window)

- **Church HQ's Resend is set up and verified** (`CHURCHHQ-EMAIL-SETUP.md`, parts A-C done).
- **The original site stays on Calla's sendEmail. v2 uses Church HQ's Resend:** the e-news first, then the hub's other emails one kind at a time, with Calla's as a fallback for a few weeks. Everything is moved by switch-over (C-20 brought forward: stage 2 and 3 before switch-over, not after).
- **The key goes into a key box, never a chat.** Built: Church settings → **Email and Canva keys** (master admins). It holds the Resend key, its webhook signing secret, and the Canva client ID and secret. It refuses to save until switch-over (`ENEWS_LIVE`), and never sends a key back to a page. check-hqmail-key 22/22, 4/4 breaks; check-keybox-page 8/8 at 375, break refill red.

## BUILT, 19 Oct 2026 evening (comms window)

All eight steps of the plan are built and checked, on emulators of this window's own (never another window's, never live). **They are held on this window's computer, not pushed**, until the main window pushes its "What does your church use?" switches (F-230) and its new Menu by job: the Menu entries for these pages belong inside that Menu, and until those switches are live a Menu entry would show on the live site even though the pages themselves say "switched off".

| What | Files | Check (all on this window's own emulators) |
|---|---|---|
| The e-news's blocks and both looks | `egbc-mailblocks.js` | check-enews-blocks 30/30, 7/7 breaks |
| The e-news page: draft, edit, previews, schedule, test, subscribers | `enews.html`, `egbc-comms.js` | check-enews-page 26/26 at 375; breaks switch, office, weekly each red |
| This week's draft makes itself (rule 13) | `enews.html` | in check-enews-page |
| Sign-up, confirm, unsubscribe, bounces | `functions/enews.js`, `functions/hq-mail.js`, `functions/enews-gate.js`, `enews-signup/confirm/unsubscribe.html`, `egbc-enews-public.*` | check-enews-subscribe 47/47, 4/4 breaks |
| Sending, once, the right copy to each person; the web version | `functions/enews-send.js`, `enews-web.html` | check-enews-send 23/23, 4/4 breaks |
| The rules (go live at switch-over) | `firestore.rules` | check-enews-rules 30/30, 9/9 breaks |
| The Mailchimp import | `tools/import-mailchimp.mjs` | check-import-mailchimp 20/20, 3/3 breaks |
| Card maker | `cardmaker.html`, `egbc-gif.js` | check-cardmaker 18/18 at 375; breaks fade, switch, nofit each red |
| Canva | `functions/canva-core.js`, `functions/canva.js`, `canva.html` | check-canva 20/20 (a pretend Canva), 3/3 breaks; check-canva-page 9/9 |

**Changes from the plan, found while building:**

- **C-22. The card maker's movements move the photo or the button, never the words** (gentle zoom, slow pan, button pulse). The mock-up's "Fade in" and "Slide up" would leave Outlook readers (who see only a GIF's first frame) with no words.
- **C-23. The weekly draft has no timer.** The first time the office opens E-news in a week, the draft makes itself (rule 13).
- **C-24. "Church member" for the e-news means the address book's church-member tick (§21).** Only those addresses get the members-only blocks. Someone on a team without the tick gets everybody else's copy. Say if team members should count too.
- **C-25. The unsubscribe page unsubscribes as soon as it opens.** That's one tap from the email, as the mock-up showed, and its own script does it, so link-checkers that don't run scripts can't. Re-subscribe is one tap on the same page.
- **C-26. Saving to the picture library is PNGs only for now.** GIFs and videos download, until the library keeps them whole (C-16). The library's rules let admins write; the Church office group may need adding (part of the C-16 request).
- **C-27. The Email Compiler's GIF maker is now shared as `egbc-gif.js`**, but the Compiler still has its own copy until it's switched over. That's one small commit once the main window's pending edits to EmailBuilder2.html are pushed.

**Waiting on others:**
- the main window's push, which unblocks the Menu entries and the check-menu lines for the four public pages (reached from email and the website);
- the C-16 request to the events window, raised once its file is free of the main window's pending edits;
- Calla's nothing: the e-news no longer uses sendEmail.

### Martin's Canva test (C-21), click by click

You do the clicks and sign in yourself. Nobody asks for your password.

1. Sign in at **canva.com** with your own free account. Turn on two-step sign-in: your picture → **Settings** → **Login & security** → **Two-step verification** → on. Canva requires this for anyone making an integration.
2. Go to **canva.dev** → **Developer Portal** → **Integrations** → **Create an integration**.
   - Choose **Public**. "Private" is Enterprise only.
   - Name: `Church HQ`.
   - Agree to the terms.
3. **Scopes:** tick only **design:meta → Read** and **design:content → Read**. Nothing else.
4. **Authentication → Redirect URLs.** Add both:
   - `https://europe-west2-egbc-worship-planner.cloudfunctions.net/canvaCallback`
   - `http://127.0.0.1:5101/egbc-worship-planner/europe-west2/canvaCallback` (for a test on a PC before switch-over)
5. **Configuration:** copy the **Client ID**. Press **Generate secret** and copy it; it is shown once. **Don't press "Submit for review".**
6. Paste both into **Church settings → Email and Canva keys** (Canva client ID, Canva client secret), then press **Save**. The box takes them from switch-over; before then, on a test PC, the reviewing window puts them in the emulator's `functions/.env.local`.
7. **The test itself.**
   - **Before switch-over:** on a PC running the emulators (the reviewing window sets that up), open **From Canva**, press **Connect Canva**, sign in to Canva, check your designs appear, and import one animated design.
   - **After switch-over:** `CANVA_LIVE = true` in `functions/canva.js`, deploy functions:hub, and do the same on the live site.

---

## Part 1: for Martin, in plain words

### What you'd get

1. **The e-news is built in the hub.** Each Monday the hub drafts the week's e-news for Val:
   - Sunday's service and preacher, from the rota
   - this week's events from What's On, each as an event card
   - the notices
   - the sign-ups

   Val adds the Bible verse and anything else, checks it on a phone view and a computer view, sends herself a test, and picks a time. It sends itself.
2. **There are two versions of every e-news.**
   - **Church members** get the full one, including the YouTube live link and the Zoom passcode.
   - **Everyone else**, and the web version, get it with those parts left out.
3. **A sign-up page** goes on the church website, and **every e-news has an unsubscribe link**. One tap unsubscribes, with no signing in.
4. **Val's card maker.** She picks an event, a style and a movement. She gets the card in every size in one go: e-news, Instagram, Facebook, the screens and A5. A moving GIF goes in the e-news, and a short video goes to social media and the screens.
5. **Canva.** Val connects her Canva once. The hub lists her designs, and "Import" brings a finished one into the picture library as a GIF, PNG or video.

### Pictures (375px, a phone)

| | |
|---|---|
| The e-news editor | `design-mocks/comms/enews-editor-375.png` |
| An event card (real words on the photo, from What's On) | `design-mocks/comms/event-card-375.png` |
| Sign-up page | `design-mocks/comms/signup-375.png` |
| After signing up ("check your email") | `design-mocks/comms/signup-done-375.png` |
| Unsubscribe page | `design-mocks/comms/unsubscribe-375.png` |
| Card maker | `design-mocks/comms/card-maker-375.png` |
| Canva designs | `design-mocks/comms/canva-375.png` |

Remake them with `node design-mocks/comms/shoot.mjs` (from `v2/`). Made-up names only.

### Five things I found that change the plan

- **C-1. The e-news can't really start before switch-over.**
  - Until the locked rules go on, anyone can read every collection in the live database without signing in (checked 14 Oct, §26 item 15). A subscriber list stored there today would expose hundreds of people's email addresses.
  - So the list, the sign-up page and the Mailchimp import stay shut until the rules deploy, the same way the private forms are held (§26 item 16).
  - **"Running alongside Mailchimp for a few weeks" starts on switch-over day, not before.** Everything else gets built and tested on the emulator now.
- **C-2. Today's sending can't take a weekly e-news.**
  - Calla's `sendEmail` sends from `EGBCWorship@callasuite.uk`.
  - It has **no unsubscribe header** and **no bounce handling**.
  - It takes at most 50 people per request and 2,000 per hour.
  - Resend's **free** plan stops at **100 emails a day**. If that is Calla's plan, a 400-person e-news fails partway through.
  - Fixes: **Resend Pro at $20 a month** (50,000 a month), or a separate church Resend account. See C-12 and Decision 2.
- **C-3. Canva: Canva's rules are stricter than the brief assumed.**
  - A **private** integration (only for our church) is **only allowed for Canva Enterprise teams**.
  - Otherwise it has to be a **public** integration, which Canva reviews before anyone else can use it.
  - Canva's docs don't say whether the person who created it can use it before review. **We need a 10-minute test with Val's account** (Decision 3).
  - Canva's developer terms bar an app "primarily intended to export designs into a third-party design platform". The hub is not a design platform, but **someone should read clauses 4(b) and 5(a) before we rely on this** (C-15).
  - **The fallback always works:** Val downloads the GIF from Canva and drags it into the picture library.
- **C-4. Canva Autofill no longer needs Enterprise.**
  - Canva's Autofill page now says it works on **Pro, Teams, and Canva for Nonprofits** (checked 19 Oct).
  - As a registered charity, the church can probably get **Canva for Nonprofits free**.
  - If Val is on one of those, Canva could fill her own templates from What's On, which may be better than our card maker. **The brief said "not Autofill", so I've planned without it.** Say if you want it looked at.
- **C-5. Today's Mailchimp web version shows the Zoom passcode and the private YouTube link to the whole internet.**
  - 15 Oct shows the prayer meeting's Zoom ID and bold passcode.
  - 8 Oct shows the "private" YouTube live link.
  - Both are on the public mailchi.mp page. Worth Val knowing now, before any of this is built.

### Decisions only you can make

1. **Where the e-news lives** (I recommend **a**):
   - **a.** A new "E-news" page that shares its building blocks and GIF maker with the Email Compiler, so nothing is written twice.
   - **b.** An "E-news" mode inside the Email Compiler (`EmailBuilder2.html`). The e-news needs subscribers, scheduling, an archive and consent records that the Compiler doesn't, so **b** makes one big page bigger.
2. **Sending** (ask Calla which Resend plan is in use). Either:
   - Resend Pro ($20 a month) on Calla's account, with the e-news counted separately from the hourly cap; or
   - a church Resend account just for the e-news.
   
   Either way, the sending address `news@esherchurch.org` needs a few DNS records added by **whoever looks after esherchurch.org's domain** (who is that?).
3. **Canva:** is Val's Canva Free, Pro, Teams or Nonprofits? And may I set up a test integration on her account (she has to turn on two-step sign-in in Canva first)?
4. **The look:** do you want the first template to look like today's Mailchimp (orange "Coming up this week" bar, teal titles), the hub's green, or both?
5. **The card maker and Calla Design:** the brief says to reuse Social Media Maker and Calla Photo. But they are Calla Design, which the briefs put out of scope ("do not touch"). They have no sign-in, so they can't read What's On. **My plan:** a new hub page that copies their *method* (the same video-recording technique) without changing their files, and shares the Email Compiler's existing GIF maker. Say if Calla Design should change instead.

---

## Part 2: the plan (for the reviewing window)

### What exists already (survey, 19 Oct)

- **`EmailBuilder2.html` (the Email Compiler)**
  - Blocks: button, heading, divider, spacer, two columns (`insertBlock` :676-700).
  - Picture upload to Storage `email_assets/` (:1125).
  - **A GIF maker**: bundled `GifWriter`, median-cut palette, up to 8 frames (:1141-1220).
  - `buildEmailHtml` (:609-665) builds 620px nested tables with inline styles.
  - It sends through the `compilerSend` callable (`functions/compiler-send.js`), one request per person, at most 50.
  - No saved templates; drafts only (`emailDrafts`, at most 10).
- **`egbc-email.js`**: `EGBCEmail.send` posts to sendEmail **without a token** (the legacy path). It stubs on localhost.
- **`functions/public-mail.js` `makeSender`**: the server path. It uses a Google identity token (`id-token.js`), logs every send to `emailOutbox`, and stubs on the emulator. **The e-news sends through this.**
- **`socialmaker.html` and `photoeditor.html` (Calla Design, out of scope)**
  - Single files, with no Firebase.
  - socialmaker has 7 social sizes and records WebM with MediaRecorder + `canvas.captureStream` (:729-763). **No GIF.**
  - photoeditor exports PNG, JPG or WebP only.
- **The picture library (events window, F-176)**
  - `pictureLibrary/{id}`. Files go to `library/<id>/<ts>.jpg`, **shrunk to a 1600px JPEG**, so an animated GIF would be flattened.
  - The Storage rule allows `image/*` up to 8 MB, so no video.
- **Data the e-news reads**
  - `calEvents`: title, start, image/imageLibId, `visibility`, `signupOn`, which links to `signup.html?event=`.
  - `news`: notices.
  - `events` (rota): date, serviceTime, speaker, publicTitle.
  - Sign-ups.
- **Feature switches**: `EGBCChurch.uses(name)` **always returns true** today (`egbc-church.js:160-169`). There is no "off until turned on".
- **Calla's sendEmail** (`C:\Users\marti\egbc-email\functions\index.js`)
  - `KNOWN_SOURCES` :93-111 (17 collection/field pairs).
  - Limits: 50 recipients, 2 MB html, a 2,000 per hour cap held in memory.
  - From `EGBCWorship@callasuite.uk` (:313).
  - **No `headers` field, no List-Unsubscribe, no webhook.**
- **Mailchimp issues (8 and 15 Oct)**
  - A 600px column with a header image and the verse as a centred bold line.
  - An orange `#FE7E07` "Coming up this week" bar.
  - About 10 cards per issue: Val's 940×788 GIF at 176px on the left, text on the right, teal `#008080` titles.
  - A green `#07A47D` "Dates for the diary" PDF button.
  - Social icons, and a dark footer with: 6 Park Road, Esher KT10 8NP · Registered Charity No 1133504 · office hours · office@esherchurch.org · 01372 468255.
  - Card pictures have empty alt text.

### Findings

- **C-1** (above): the subscriber data is held until the rules deploy. The gate is the same `churchSettings/launch.rulesLocked` as the private forms. The sign-up page shows "opening soon", and the import tool refuses `--write` until then.
- **C-2** (above): sending capacity, the headers and bounces need Calla (C-12).
- **C-3, C-4, C-5** (above).
- **C-6. Feature switches that start OFF.**
  - `EGBCChurch.uses()` treats everything as on.
  - Add a short "off until turned on" list (`enews`, `cardMaker`, `canva`), read from `churchSettings/features`. Only an explicit `true` turns these on, and master admin sets it in Church settings.
  - This touches the shared `egbc-church.js`, so it gets one small commit with its own check: the three are hidden for everyone until set, and appear once set.
- **C-7. Members-only blocks, decided per person, not per issue.**
  - Any block can be marked "members only". It shows in gold, as in the mock.
  - The sender builds two HTML versions:
    - **members:** the subscriber's email matches an active address-book person at Church member or above (§21);
    - **everyone else.**
  - The web version and archive are always the "everyone" one.
  - Test: a subscriber who isn't in the address book never gets the Zoom passcode, and the web page never has it. Deliberate break: mark the passcode block public and the check must go red.
- **C-8. Event cards are real text, not a picture.**
  - In email, the photo is a cell background with the words as HTML on top. A VML fallback lets old Outlook show it, and a dark solid colour shows if pictures are blocked.
  - The words stay readable with pictures off, can be searched, and the card updates if the time changes before sending.
  - **Val's Canva GIFs** (words baked in) go in as a "picture card" block instead, with alt text filled in automatically from the event title (today it's empty).
  - Old Outlook on Windows shows only the GIF's first frame, so the card maker always puts the words in frame 1.
- **C-9. Event visibility decides what goes in.**
  - The automatic draft takes `calEvents` from the next 14 days whose `visibility` is `public`, as a normal block.
  - It takes `members` / `churchMembers` events as members-only blocks.
  - It never takes `team` or `unlisted` events.
  - Test with deliberate break: an `unlisted` event (the AA case) must never appear in any version.
- **C-10. Subscribers: one record per email address, with consent.**
  - `enewsSubscribers/{random id}`, never keyed by email.
  - Fields:
    - `email`, `firstName`
    - `status`: pending, subscribed, unsubscribed, bounced or complained
    - `lists`: `{weekly, special}`
    - `consent`: `{at, how: 'web form (confirmed by email)' | 'Mailchimp import' | 'office, paper form', wording: <version id of the exact sign-up text>, confirmedAt, source}`
    - `history[]`: every change, with date
    - `token`: a long random string for unsubscribe links
  - Someone who unsubscribes is **kept as unsubscribed** (a do-not-contact record), never deleted and never re-imported.
  - Office view: list, search, add by hand (with a "how did they agree?" choice), CSV download.
  - Rules: only the office and master admin read it. The public can only *create* a `pending` record of the exact shape (the `welcomes` pattern, firestore.rules :3927). Changes after that go through functions only.
- **C-11. Sign-up and unsubscribe.**
  - **Sign-up (`enews-signup.html`)**: a public page, no sign-in. It can be embedded on esherchurch.org.
    - **Double opt-in**: a trigger on the pending record emails a confirm link. Only confirmed records are sent the e-news.
    - Against abuse (someone typing other people's emails in): at most one confirm email per address per 24 hours, a hidden honeypot field, and pending records that are never confirmed are deleted after 14 days.
  - **Unsubscribe (`enews-unsubscribe.html?t=<token>`)**: the page's own script posts to a hub function (`enewsUnsubscribe`). Link-checkers that open links but don't run scripts can't unsubscribe someone by accident.
  - **One-click from the mail app**: every e-news also carries `List-Unsubscribe: <https://…/enewsUnsubscribe?t=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The function accepts that POST and returns a blank 200 (RFC 8058).
  - Unsubscribing takes effect at once (Gmail and Yahoo require within 2 days).
  - The page offers re-subscribe and "special notices only".
- **C-12. What Calla's sendEmail needs** (planned here; Calla's window writes it, the reviewing window and Martin deploy `--only functions:sendEmail` from `C:\Users\marti\egbc-email`):
  1. `KNOWN_SOURCES` += `['enewsSubscribers','email']`, but **only addresses with status `subscribed` or `pending`**. Today's check only asks "is the address in the collection?", so an unsubscribed address would still count as known. That needs a status filter on this one source.
  2. Accept a `headers` object (List-Unsubscribe and List-Unsubscribe-Post only) on the **server path only**.
  3. A per-request `from` chosen from an allowed list (`news@esherchurch.org` once verified), server path only.
  4. The e-news counted outside the 2,000-an-hour cap, or the cap raised for the server path. A send of about 400 is 400 requests, one per person, because each person's unsubscribe link is different.
  5. A **Resend webhook** (bounced, complained, suppressed). Verify the svix signature on the raw body, dedupe on `svix-id`, and post to a hub function that marks the subscriber `bounced`/`complained`. After a hard bounce they're never sent again.
  6. **Resend plan:** free is 100 a day, so the weekly send needs Pro ($20 a month) or a separate account. **Calla to check which plan is live.** Resend's Batch endpoint (100 per call, an `Idempotency-Key` per send) is gentler than 400 single calls. Worth Calla's view.
- **C-13. The sending domain** (plan only, nothing done).
  - Use a subdomain, **`news.esherchurch.org`**, so a bad week can't harm normal office email from esherchurch.org.
  - In Resend: add the domain. Resend shows the exact records: a DKIM TXT at `resend._domainkey.news`, and an SPF TXT plus MX on `send.news`.
  - Add `_dmarc.news.esherchurch.org` `v=DMARC1; p=none; rua=mailto:<office>`.
  - Send from `EGBC e-news <news@news.esherchurch.org>`, with reply-to `office@esherchurch.org`.
  - Whoever holds the esherchurch.org DNS adds the records. They take effect within hours.
- **C-14. Mailchimp import with consent.**
  - `tools/import-mailchimp.mjs`, the same shape as the other import tools: Admin SDK, `--live` looks first and writes nothing, `--live --write` writes, and a second run says "0 written".
  - It reads Mailchimp's export ZIP (separate subscribed, unsubscribed and cleaned files):
    - **subscribed** → `subscribed`, with `consent.how = 'Mailchimp import'` and Mailchimp's own `OPTIN_TIME`/`CONFIRM_TIME`;
    - **unsubscribed** → kept as `unsubscribed` (so they're never emailed);
    - **cleaned** (bounced) → `bounced`.
  - It never touches the address book.
  - **The law, simply:** people on the Mailchimp list already agreed to the e-news, so that agreement carries over and we keep the record of it. The new charity "soft opt-in" (in force 5 Feb 2026) doesn't apply to them, and we don't need it: everyone new signs up on the form.
  - Items promoting *another* charity (e.g. a cake sale for Dignify) are fine for people who signed up, because they agreed to the e-news itself.
  - **It runs only after the rules deploy (C-1).** Martin exports the ZIP from Mailchimp: Audience → Export, all contacts.
- **C-15. Canva, built carefully.**
  - **Connect:** OAuth with PKCE. The code exchange happens in a hub function (it needs the client secret, and Canva blocks it from browsers).
  - **Storage:** the refresh token and client secret go in a server-only document (`integrationSecrets/canva`, denied to every page, like `paymentSecrets`).
  - **Gate:** `functions/canva-gate.js` (`CANVA_LIVE = false`), exactly like `payments-gate.js`. Until switch-over, the live functions refuse, because the open database would expose the token.
  - **Refresh:** access tokens last 4 hours and refresh tokens are single-use, so each refresh saves the new one in a transaction.
  - **Scopes:** `design:meta:read` (list designs) and `design:content:read` (export) only. We never write to Canva.
  - **List:** `GET /v1/designs`, 25 at a time. Thumbnails expire after 15 minutes, so they are fetched fresh and never stored.
  - **Import:** `POST /v1/exports` with gif, png or mp4, then poll. The download link lasts 24 hours, so the function copies the file straight into Storage and adds it to the picture library.
  - **Limits:** 20 exports a minute and 500 a day per user, far above what Val needs.
  - **Terms:** before building, someone reads Canva Developer Terms 4(b)(vii) (a clause reportedly about deleting media within 5 minutes, which may only cover media-processing apps) and 5(a)(viii). I couldn't confirm the exact wording.
  - **Fallback if Canva won't approve:** drag-and-drop import of the downloaded GIF or MP4, which needs nothing from Canva.
- **C-16. The picture library must keep GIFs and videos whole.**
  - Today it shrinks everything to a 1600px JPEG, so an animated GIF loses its movement, and its Storage rule has no video.
  - It's the events window's file (F-176), so this goes in as a **request in FINDINGS-events.md**:
    - keep GIF and MP4 originals (GIF up to 8 MB, MP4 up to 50 MB, `video/mp4`);
    - make a still JPEG thumbnail for lists;
    - add a `kind` field (still, animated or video).
  - The card maker and the Canva import both wait for it.
- **C-17. The card maker (`cardmaker.html`, feature `cardMaker`).**
  - A hub page, signed in, for the office and the comms team. It **doesn't change Calla Design** (Decision 5).
  - Reuse:
    - the Email Compiler's `GifWriter` moves to a shared `egbc-gif.js`, used by both. EmailBuilder2 is changed only to load it, and its existing GIF check has to stay green;
    - video uses the same MediaRecorder method as socialmaker: MP4 where the browser can (Chrome, Safari), WebM otherwise.
  - Sizes:

    | Use | Size |
    |---|---|
    | E-news | 940×788 (Val's size) |
    | Instagram | 1080×1080 |
    | Facebook | 1200×630 |
    | Screen | 1920×1080 |
    | A5 print | PNG at 1748×2480 |
  - Templates: 4 to start, **drawn from Val's real Canva cards once she sends 3 or 4 samples** (the colours in the mocks are placeholders).
  - Movement: none, fade in, slide up, gentle zoom. The words are in the first frame.
  - Output: "Save to library" saves every size, tagged with the event, so the e-news, the event page, the app and the screens can pick it up.
- **C-18. Scheduling and the archive.**
  - `enewsIssues/{id}`: blocks, status (draft, scheduled, sending, sent), `sendAt`, and counts.
  - A hub function runs **every 5 minutes** (onSchedule, Europe/London). It picks up due issues, marks them `sending` in a transaction (so the issue can't be sent twice), and sends with `makeSender`. Each person's result goes to `emailOutbox`.
  - The **Monday draft**: onSchedule `0 7 * * 1` creates the week's draft if none exists (rule 13: nothing to press).
  - **Web version / archive**: `enews.html?issue=` is public, and shows only the "everyone" HTML, saved when the issue was sent.
  - **Test send**: "Send me a test" goes only to the signed-in person.
- **C-19. Who can use it.** The e-news and subscribers are the church office (§25: Val, Ryan) and master admin. The card maker and Canva are the office plus whoever the office adds to a "Comms" group. Each gets a Menu entry with the feature name (rule 14), under "People and messages" in the new by-job Menu.

### Order of work (each step: checks, deliberate breaks, the audit, a report)

1. **Switches (C-6)** and an empty E-news page behind `enews`, with its Menu entry.
2. **Blocks and preview**: the shared block code from the Email Compiler, plus the new blocks (event card, verse, picture card, members-only marking, footer). Phone and computer preview. Templates.
3. **Automatic Monday draft** (C-9, C-18) from What's On, the rota, notices and sign-ups.
4. **Subscribers, sign-up, confirm, unsubscribe** (C-10, C-11). Emulator only, with the rules written but not deployed.
5. **Sending through the server**, the two versions (C-7), scheduling, the archive. Proven on the emulator with sendEmail stubbed. **The real send waits for Calla's C-12 changes and the domain (C-13).**
6. **The Mailchimp import tool** (C-14). The dry run can be tried on a synthetic export. The live run happens on switch-over day.
7. **Card maker** (C-17), after the picture-library request (C-16).
8. **Canva** (C-15), after Decision 3 and the terms check.

### New lines for §26 (switch-over checklist)

- After the rules deploy:
  - Martin turns on `enews` in Church settings;
  - runs `tools/import-mailchimp.mjs --live`, then `--live --write`;
  - checks the sign-up page on esherchurch.org.
- Church HQ's Resend is set up (`CHURCHHQ-EMAIL-SETUP.md`, parts A-E): `mail.churchhq.co.uk` verified; the Resend key and signing secret pasted into the key box (parts D and E); the webhook pointing at `hqMailEvents`. Then `ENEWS_LIVE = true` in `functions/enews-gate.js`, and deploy functions:hub.
- `CANVA_LIVE = true` in `functions/canva-gate.js`, then deploy functions:hub, then Val connects Canva.
- E-news and Mailchimp run side by side for 3-4 weeks. Retire Mailchimp only when the hub's sends show no bounce or complaint problems (Resend: bounces under 4%, complaints under 0.08%).

### Not verified (said plainly)

- Whether an unreviewed public Canva integration works for its creator's own account.
- The exact wording of Canva's developer terms.
- Which Resend plan Calla's account is on.
- Resend's exact DNS records (they're shown in its dashboard).
- The full Mailchimp export column list.
