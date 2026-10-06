# Share to WhatsApp and app notifications — build brief

For the Code window working in `Esherchurch/availability-form`, **`v2/` only**. Written 2026-10-06.
Martin writes no code: this brief is the spec, you build, he assesses. Order of work is set in `v2/NEXT-BRIEF.md`.

Standing rules from `NEXT-BRIEF.md` §4 apply (no app retired, nothing outside `v2/`, synthetic data only, no rules deploy, `DESIGN.md`, 375px, out-of-scope apps untouched).

---

## Part 1 — Share to WhatsApp

### What and why
Martin posts weekly to WhatsApp groups (e.g. **EGBC Enews**, an announcement group) by copying text and a Mailchimp link by hand. Make it one button: **write once in the hub, press Share, WhatsApp opens with the message ready, pick the group, send.** It uses each person's own WhatsApp — no WhatsApp business account, no approval, no cost.

### Where the button goes
Notices (hub card, pinned notice, the read view), meetings (`meeting.html`, the hub's meetings card), and — when they exist — events (`EVENTS-BOOKINGS-BRIEF.md`). One shared helper, **`v2/egbc-share.js`**; do not write a second one.

### What it sends
- **Text formatted for WhatsApp**, converted from the hub's HTML (the notice editor's output): headings and `<b>` → `*bold*`, `<i>` → `_italic_`, `<s>` → `~strike~`, lists → `- ` / `1. ` lines, `<blockquote>` → `> `, links → the URL on its own line, paragraphs → blank lines. Keep it short: title, date/time, the key text, the link. Trim long notices to a sensible length with "Read more:" and the link.
- **A preview screen first** showing exactly what will be sent, editable as plain text, with **Share** and **Copy**.
- **Picture (Should):** if the item has a picture (notice image, event poster), offer to include it.

### How it opens WhatsApp
1. **Phone** (and any browser with the Web Share API): `navigator.share({ text, files? })`. The person chooses WhatsApp, then the group. Include the picture as a file when chosen and `navigator.canShare({ files })` allows it.
2. **Computer / fallback:** open `https://wa.me/?text=<encoded>` — this opens **WhatsApp Desktop** if installed, otherwise WhatsApp Web, with the message ready and a chat picker.
3. Always offer **Copy message** as the last resort.

**Establish on real devices** and record in `v2/FINDINGS-share.md`: Android phone, iPhone, Windows PC with WhatsApp Desktop (Microsoft Store version), and WhatsApp Web — for text-only and text+picture. In particular whether the Windows share sheet offers WhatsApp Desktop with a picture. Do not claim a case works without trying it.

### The link preview card — know the limit
WhatsApp builds the card by fetching the link **without logging in**. Hub pages need a login, so the card shows the generic EGBC card. **Set good site-wide preview tags** (`og:title`, `og:description`, `og:image` = the EGBC logo, `og:site_name` = "EGBC Hub") on the v2 entry pages so that generic card looks right.
**Later (not this build):** public per-item "share pages" made by a server function, so each notice/event gets its own picture and title in the card. Record as a finding.

### Proof
A test notice with a heading, bold, a list and a link → the preview shows correct WhatsApp formatting → Share opens WhatsApp on each tested device with that text. Break the formatter (e.g. drop list handling) and show the unit test failing.

---

## Part 2 — App notifications (push)

### What and why
People with the EGBC Hub (or a companion app) installed get **notifications on their phone or computer** — free, no SMS cost. Martin has said yes.

### What exists (checked 2026-10-06)
- `v2/sw.js` — a minimal service worker (install/activate/offline fetch), registered by several in-scope apps (CoreTeamApp, SundayServicePlanner, index, youthapp2, youthserviceplanner). **No push code anywhere in v2.**
- Email is sent by a Cloud Run function (`https://sendemail-irkwdhx3xq-uc.a.run.app`). **Its source is not in this repo.**

### Establish first (record in `v2/FINDINGS-notify.md`, then stop and ask if blocked)
- Where the `sendemail` function's source lives, and whether a **send-notification** function can be added beside it, or whether Firebase Cloud Functions is available (which plan the project is on).
- What Martin must do by hand, step by step (e.g. enabling Cloud Messaging and creating the Web Push key in the Firebase console; deploying the function). **Write those steps for Martin in plain words**; do not do console steps yourself.

### Build
- **Firebase Cloud Messaging (web push).** Extend `v2/sw.js` (do not add a second service worker on the same scope) to receive and show notifications and open the right page when tapped.
- **Asking permission:** never on page load. A clear "Turn on notifications" button in the person's profile / settings, and a gentle one-time prompt on the hub home. On iPhone, notifications only work for apps **added to the home screen** — show a short "Add to Home Screen first" guide there instead of a button that cannot work.
- **Tokens** stored per person and device (`pushTokens`), removed when a send reports them invalid. Rules: a person writes only their own tokens; nobody reads others'.
- **Preferences per person**, all on by default except where noted:
  - New notice for my teams (pinned ones always)
  - I've been put on, or taken off, the rota
  - Meeting starting in 15 minutes (my meetings)
  - Event reminders, sign-up confirmations (once events exist)
  - Quiet hours (default 21:30–07:30, except urgent)
- **Sending:** server side only (the function above), with the sender's permission checked there. Admins get **"Also send as a notification"** on the notice editor, and a **test notification** button for themselves.
- **Timed notifications** (meeting in 15 minutes, reminders) need a scheduler. **Establish** whether one is available (e.g. Cloud Scheduler calling the function). If not, build the immediate ones and record the timed ones as a finding — do not build a scheduler of your own.
- Notifications carry **no sensitive data** (no medical or safeguarding detail, no addresses) — title and a short line only; the detail is behind the login.

### Proof
On a real Android phone, a real iPhone (installed to home screen) and a desktop browser: turn on, receive a test, tap it and land on the right page, turn off and stop receiving. Rules tests for `pushTokens` with a deliberate break caught.

---

## Chunks

- **Share — Chunk 1:** Part 1 in full. Stop and report.
- **Notify — Chunk 1:** establish (above), write Martin's manual steps, stop and report **before** building — Martin has to do the console steps.
- **Notify — Chunk 2:** build and prove Part 2.

Each report: files changed · deliberate breaks and which test caught each · lock-out check (`git diff --stat` only in `v2/`) · found and not fixed, numbered · the one proof that matters.
