# Findings — phone notifications (SHARE-NOTIFY-BRIEF Part 2)

Step F: establish only. Written 9 October 2026 by the events window, which
now owns notifications (moved from the main window). **Nothing is built yet.**
Step K (the build) starts once Martin has done the console steps in N-1.

---

## N-0 — what is there today (checked 9 October 2026)

**The server side is ready to take a sending function.**
- The hub has its own Cloud Functions codebase, **"hub"** (`v2/functions/`,
  region europe-west2). It already runs **timed** functions (booking
  reminders, document-expiry reminders, on a schedule). That means the
  project is on Firebase's pay-as-you-go plan and has a scheduler, so timed
  notifications are possible later.
- `sendEmail` is not in this repo: it belongs to the Calla window. That
  doesn't matter here, because notifications get their own function in
  codebase "hub". It always deploys with `firebase deploy --only functions:hub`.
- `v2/functions/` belongs to the main window, so the sending function is a
  request (N-4).

**The app side needs three small things.**
- **`sw.js`** is 8 lines (install, activate, an offline reply), with **no
  push code**. The brief says to extend it, not add a second service worker.
  I'll put the notification part in a new `egbc-notify-sw.js`. `sw.js` then
  needs one line, `importScripts('egbc-notify-sw.js');`, which is a request
  for the main window (N-5).
- **`hub.html` doesn't register `sw.js`.** Other pages do (Core Team app,
  Service planner, the youth apps, index), all with the same scope (`v2/`).
  A phone that has only ever opened the hub app may have no service worker,
  so it can't receive anything. The hub needs to register `sw.js` too, a
  request (N-5).
- **The Firebase config has no `messagingSenderId`.** Cloud Messaging needs
  it (it is `199442060489`, from the app id). Rather than touch
  `egbc-auth.js` (the main window's), `egbc-notify.js` will start its own
  small Firebase app instance with the same project plus that number. Nothing
  else changes.
- The hub's manifest (`manifest-hub.json`) is already `"display": "standalone"`
  with scope `v2/`. That's what an iPhone needs for notifications from a
  Home Screen app. No change needed.

**Phones:**
- **Android (Chrome):** notifications work for the installed hub app, and in
  the browser too.
- **iPhone:** only on **iOS 16.4 or later**, and only for the app **added to
  the Home Screen from Safari** and opened from that icon. In Safari itself
  they never work. The "Turn on notifications" button must be pressed by the
  person; an iPhone refuses a prompt that comes up on its own. Where it can't
  work, the page shows "Add to Home Screen first" instead of a button.

---

## N-1 — MARTIN'S STEPS in the Firebase console (plain words)

You do these once. They don't change anything people can see. Code windows
never do console steps.

**Step 1: make the "web push" key.**
1. Go to https://console.firebase.google.com and open the project
   **egbc-worship-planner**.
2. Click the **cog** (top left, next to "Project Overview"), then
   **Project settings**.
3. Click the **Cloud Messaging** tab.
4. Scroll down to **Web configuration**, then **Web Push certificates**.
5. Click **Generate key pair**.
6. A long line of letters and numbers appears under "Key pair". **Copy it and
   paste it to the events window.** It's the *public* half of the key, so
   it's safe to share. The private half stays inside Google.

**Step 2: check the messaging service is switched on.**
1. Still on the **Cloud Messaging** tab, near the top, find **Firebase Cloud
   Messaging API (V1)**.
2. If it says **Enabled**, you're done.
3. If it says **Disabled**, click the **three dots** next to it, then
   **Manage API in Google Cloud Console**, then the blue **Enable** button.
   Then come back.
4. Leave the older "Cloud Messaging API (Legacy)" alone. It's not used.

**Step 3: later, when step K is built (not now).** You'll be given:
- the rules to deploy, as usual
- one function to deploy, with exactly: `firebase deploy --only functions:hub`

**For testing (later):**
- an Android phone with Chrome
- an iPhone on **iOS 16.4 or newer**: open the hub in **Safari**, tap
  **Share**, then **Add to Home Screen**, and open it from the new icon

To check an iPhone's version: Settings, then General, then About, then iOS
Version.

---

## N-2 — how step K will work (the plan, for Martin to agree)

**First message type: "call a parent"**, from the leader screen on Sunday
check-in, next to "Page a parent" and "Show on screen".
- It goes **to that family's parents' phones only**.
- **The code and the group only.** For example, title "Please come to Little
  ones", text "Collection code K7P2". There's no child's name and no medical
  detail; the detail stays behind the login.
- Tapping it opens the hub.
- It isn't held back by quiet hours: a leader is calling a parent now.

**Which phones are "the parents' phones"?** A family's parent is matched by
the **email on their registration form** (`kidsFamilies.email`) to the email
they **sign in to the hub** with. Sign-in emails are checked, so a stranger
can't claim one. **Decision for Martin (N-6a).**

**People choose.** A new "Notifications" page (`notifications.html`, new and
mine) has:
- **Turn on notifications on this phone**, or "Add to Home Screen first" on
  an iPhone in Safari
- one switch per kind of notification. To begin with: **"A leader calls me
  to collect my child"** (on by default). Later: new notices for my teams;
  put on or taken off the rota; meeting starting in 15 minutes; event
  reminders and sign-up confirmations.
- **quiet hours**, default 21:30 to 07:30, except urgent ones like calling a
  parent
- **a test notification to myself**
- **Turn off on this phone**

**Data (rules in my section, tested, with a deliberate break):**
- `pushTokens/<id>`: one per person per phone: `{ uid, token, platform,
  createdAt, lastSeen }`. A person writes and deletes **only their own**.
  **Nobody reads them**, not even the person: only the server sends. A
  token a send reports as dead is removed by the server.
- `notifyPrefs/<uid>`: a person's own switches and quiet hours. Only they
  read or write it.
- `notifyLog/<id>`: what was sent, when and by whom, with the number of
  phones only (no tokens), for the leads and the safeguarding lead.

**The sending function (main window's codebase "hub"), `callParent`:**
- signed in only
- the caller must be allowed to page that child: a lead, that group's leader,
  or that morning's Session Leader (the same test as `screenPages`, done
  again on the server)
- the child must be checked in now
- it finds the family's parent sign-ins, their phones and their switches,
  and sends one message to each phone
- it removes dead phones, writes the log and returns how many phones it
  reached ("Sent to 2 phones" or "Ellie's parents have no phone set up:
  use Show on screen or ring them")
- at most one call per child per 2 minutes

---

## N-3 — files step K adds (mine)
- `egbc-notify.js`: turning on and off, the token, the switches, the test
  message, and the iPhone check
- `egbc-notify-sw.js`: the service-worker part. It shows the message and
  opens the hub when it's tapped. It is loaded by `sw.js` (N-5).
- `notifications.html`: the page above
- the "Call on their phone" button on `kids-checkin.html`
- rules for `pushTokens`, `notifyPrefs` and `notifyLog`, with tests and a
  deliberate break; browser tests for the switches and the button. The
  phone itself can't be tested on the emulator, so real phones prove it
  (N-7).

## N-4 — REQUEST for the main window: the sending function
`callParent`, a callable function in codebase "hub", as N-2 describes.
I'll write the exact behaviour, with test cases, as a spec here when step K
starts (as with the booking reminders, F-074). Deployed with
`firebase deploy --only functions:hub`. Later timed messages ("meeting in 15
minutes") can use the scheduler that's already there.

## N-5 — REQUESTS for the main window: service worker and hub
1. `sw.js`: add `importScripts('egbc-notify-sw.js');` at the top, and bump
   `VERSION`. Nothing else changes.
2. `hub.html` / `hub-app.js`: register `sw.js` (scope `v2/`), as the other
   apps do, so a phone with only the hub app installed can receive.
3. The Menu: "Notifications" (`notifications.html`), for everyone signed in.
4. The hub's profile area, later: a link to Notifications, and the gentle
   one-time "Turn on notifications?" prompt on the hub home that the brief
   asks for (never on page load).

## N-6 — DECISIONS for Martin
a. **Which phones are a family's parents' phones?** Recommended: the person
   signed in with the same email as on the registration form. The other way
   is a parent typing their family code once on the Notifications page,
   which suits a parent who signs in with a different email.
b. **Parents who aren't in the address book** sign in as "pending" (§21).
   Recommended: they may still turn on "call a parent" notifications, and
   nothing else.
c. **A second parent or carer** with their own phone: the registration form
   has one email. Should the form ask for a second email for notifications?

## N-7 — how step K is proved
On a **real Android phone**, a **real iPhone** (16.4+, added to the Home
Screen) and a desktop browser, with made-up names:
- turn on
- receive a test
- a leader presses "Call on their phone" and the parent's phone shows
  "Please come to Little ones / Collection code K7P2"
- tap it and land in the hub
- turn the switch off, and the next call doesn't arrive

Martin does that last proof with the Code window guiding, since Code can't
hold a phone. On the emulator: rules tests (a person reads or writes only
their own tokens and switches; nobody else reads tokens), with a deliberate
break caught; and browser tests of the page and the button, with the
function's reply mocked.

## N-6 — decided (Martin, 9 October 2026), for when step K is built
a. **A parent's phone is linked by the email on the registration form**
   matching the email they sign in to the hub with.
b. **Yes:** parents not in the address book ("pending") may get "call a
   parent" notifications, and nothing else.
c. **Yes:** the registration form gets an **optional second parent's email**,
   so a second parent or carer can be linked too.

**On hold:** notifications aren't to be built yet. Martin is designing the
phone app first, and notifications will be built to that design.

**No longer on hold (Martin, NEXT-BRIEF §23, 10 October 2026):**
notifications are part of the launch. N-1 is done: the Web Push key pair is
made, and its public half is in `egbc-notify.js`.

---

## N-8 — what the events window built (step K; F-144)
- **`egbc-notify-core.js`:** what each message says, the quiet hours, and
  who gets what. It's a plain function, used by the page and by your
  sending function alike.
  - **The launch messages:** call a parent, rota reminder, booking updates,
    a new maintenance job, an urgent notice, and checks running out (§24).
  - **Call a parent says the group and the code only.** The wording is
    built from those two alone, so it can't carry a child's name even if
    handed one.
  - **Email is the fallback:** someone with no phone set up is emailed
    instead. The exception is booking updates, which the page emails
    already.
  - **Quiet hours** (21:30 to 07:30 unless changed): messages arrive
    silently. Calling a parent and urgent notices are never quiet.
  - Unit test: 21 checks.
- **`egbc-notify.js`:** turning notifications on and off on this phone, the
  switches, "send me a test" and "call on their phone", and knowing what a
  phone can do:
  - **Android:** the button works.
  - **iPhone in Safari:** the Add to Home Screen guide.
  - **iPhone on iOS older than 16.4:** "update it first".
  - **Blocked:** how to allow them.
  - **Unsupported browser:** says so.
- **`egbc-notify-sw.js`:** the service worker part. It shows each message
  the same way on Android and iPhone, and opens the hub at the right page
  when tapped. Loaded by `sw.js` (N-5).
- **`notifications.html`:**
  - the switches and quiet hours
  - "Turn on" / "Turn off on this phone" and "Send me a test"
  - **the iPhone guide, in four plain steps with pictures**
  - a parent not in the address book sees only "call a parent" (N-6b)
- **"Call on their phone":** on Sunday check-in (the leader's view) and in
  the app's Kids Church Today, beside Show on screen and Ring. It sends only
  the check-in's id, and says plainly what happened. If the function isn't
  live yet, it says to use Show on screen or ring.
- **Rules** (21 checks):
  - **phone records:** a person adds, refreshes and removes only their own,
    and **nobody reads them**, not even their owner
  - **switches:** a person's own only
  - **log:** what was sent; only the function writes it, and master admins,
    the safeguarding lead and the site's Kids Church leads read it
- **Browser tests:**
  - `notify` (20): Android, iPhone in Safari, iPhone on the Home Screen, an
    old iPhone, blocked, and a parent not in the book
  - Kids Today (21): the call button

## N-4 — REQUEST for the main window: the sending functions (codebase "hub")
**One shared sender, then a small function per message.** Deploy with
`firebase deploy --only functions:hub`.

**1. `send(uids, type, data, opts)` (shared):**
- Copy `egbc-notify-core.js` into functions as `notify-core.cjs`. It's
  CommonJS when `module` exists, and uses only `Intl` and `Date`.
- **Read**, for those uids:
  - `notifyPrefs/<uid>` (or the defaults, if missing)
  - every `pushTokens` where `uid` is one of them
  - their emails, from the address book (or from the auth account, for a
    parent not in the book)
- **Plan:** `plan = Core.plan({ uids, type, prefs, tokens, emails, now: new Date() })`.
- **Push:** for each `plan.push` entry, send one **data-only**
  `sendEachForMulticast` to its tokens:
  - `webpush.headers: { Urgency: type === 'callParent' || type === 'urgent' ? 'high' : 'normal', TTL: '3600' }`
  - `webpush.data`: `Core.message(type, data)` as strings, plus
    `silent: String(entry.silent)`
  - Data-only is what `egbc-notify-sw.js` expects, and it looks the same on
    Android and iPhone.
- **Dead phones:** delete any token the send reports as
  `messaging/registration-token-not-registered` or `invalid-argument`.
- **Email:** for each `plan.email` entry, send the same title and words
  through the email route the other functions use.
- **Log:** write `notifyLog/<id>`:
  `{ type, siteId, by, at, phones: n, emailed: n, skipped: n }`. **Never a
  token or an address.**
- **Return** `{ phones, emailed, none }`.

**2. `callParent`** (callable, signed in), data `{ checkinId }`:
- **Read the check-in:** it must be `kind: 'child'` and `state: 'in'`;
  otherwise return `{ reason: 'not-in' }`.
- **Check the caller** may page that child, the same test as `screenPages`
  and Show on screen:
  - a Kids Church lead of the site, or
  - that group's leader, or
  - that morning's Session Leader (`kidsMornings`)
- **At most once per check-in per 2 minutes:** otherwise return
  `{ reason: 'too-soon' }`.
- **Find the family:** `kidsFamilies/<check-in's familyId>`.
- **Find the parents' accounts:** match `email` and `email2` against auth
  users, by `getUserByEmail`, **with `emailVerified` true**.
- **Send:** `send(those uids, 'callParent', { group: <the group's name>,
  code: <check-in's pickupCode> })`. **Nothing else goes in.**
- **Return** `{ phones, emailed, none }`. The page turns that into "Sent to
  2 phones", "emailed 1", or "no phone set up: use Show on screen or ring
  them".

**3. `notifyTest`** (callable): `send([caller], 'test', {})`.

**4. The other launch messages:**
- **`rotaReminders`:** scheduled daily at 17:00 Europe/London. For
  tomorrow's `events`, each person assigned gets `send([uid], 'rota',
  { roles, arrive, place })`.
- **`bookingNotify`:** `onDocumentUpdated('bookings/{key}')`, when `status`
  changes to confirmed, approved (requested to confirmed), declined or
  cancelled. If the booking has a `memberUid`, `send([memberUid],
  'booking', { status, room, when })`. The page emails already, which is why
  `booking` has no email fallback.
- **`maintJobNotify`:** `onDocumentCreated('maintJobs/{id}')`. The
  Maintenance team's uids get `send(uids, 'maintJob', { where, what,
  url: 'maintenance.html#' + id })`. **No photo.** This also does F-129: its
  email fallback is that email.
- **`urgentNotice`:** when a notice is marked urgent (yours: the notice
  editor and its field). Everyone it is for gets `send(uids, 'urgent',
  { title, text })`.
- **`checksReminders` (§24):** scheduled weekly. For every `leaderChecks`
  record, `checksDue(list, settings, today, 42)` from
  `egbc-events-safeguarding.js` gives who is running out.
  - Each person gets `send([their uid], 'checks', { what, state, ends })`.
  - The site's safeguarding lead gets one email listing them.
  - **At most one reminder per person per thing per fortnight.** Keep
    `checksReminded/<memberId>_<what>`, written by the function only.

**Tests I'd suggest on your side:**
- `callParent` refuses a member who leads nothing that morning.
- It never puts a name in the message.
- Two calls inside 2 minutes: the second returns `too-soon`.
- A dead token is removed.
- Someone with no phone is emailed, except for bookings.

## N-5 — REQUESTS for the main window: the service worker, the app, the links
1. **`sw.js`:** add `importScripts('egbc-notify-sw.js');` at the top and bump
   `VERSION`. Nothing else changes.
2. **Register `sw.js`** (scope `v2/`) in **`app.html`** and `hub.html`, so a
   phone with only the app installed can receive.
3. **`app.html`:**
   - load `firebase-messaging-compat.js`, `egbc-notify-core.js` and
     `egbc-notify.js`
   - Me → **Notifications** (`open:notifications.html`)
   - the **gentle one-time "Turn on notifications?"** on Home, never on
     page load: a row that opens Notifications
   - Kids Church Today's "Call on their phone" appears once
     `egbc-notify.js` is loaded
4. **The Menu:** "Notifications" (`notifications.html`), for everyone signed
   in.
5. **Parents not in the address book** can't get into the app at all today:
   its door turns away an address the church doesn't hold. Martin's N-6b
   lets them have "call a parent", and Parents' Sunday (F-121) is for them
   too.
   - Please let a signed-in, **verified** email in to a parent's view: Home
     with "This Sunday, for parents", and Me with Notifications.
   - `notifications.html` already admits them.

## N-7, updated — the real-phone proof (Martin, with the window guiding)
Once N-4 and N-5 are live, on a real Android phone and a real iPhone
(16.4+, added to the Home Screen), with made-up names:
1. Turn notifications on.
2. "Send me a test": it arrives.
3. A leader presses "Call on their phone", and the parent's phone shows
   "Please come to Little ones / Collection code K7P2".
4. Tap it: the hub opens.
5. Turn the switch off: the next call doesn't arrive, and is emailed
   instead.
