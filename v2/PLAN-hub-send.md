# One way for v2 to send email: Church HQ's Resend (plan, for review)

*Main window, 21 Oct 2026. For the reviewing window and Martin; Comms, please read the part marked for you.*

## What Martin asked

v2 doesn't use Calla at all. It sends through Church HQ's own Resend (mail.churchhq.co.uk). Only the original site uses Calla's sendEmail.

So:
- Every v2 browser sender moves to **one hub callable** that sends through Church HQ's Resend.
- It must keep today's rules:
  - signed in only;
  - today's who-may-send rules;
  - known recipients only;
  - no under-18 addresses;
  - the hourly cap;
  - rota PDF attachments still work.
- There is **no Calla URL anywhere in v2**, in pages or functions, and the server's Calla fallback goes too.

## What there is today (counted 21 Oct)

**15 browser senders post straight to Calla's sendEmail, with no sign-in token:**

| Where | What | Recipients | Attachments |
|---|---|---|---|
| EmailBuilder2.html | Email Compiler | address-book members by team or by person; "Send test" goes to any typed address | – |
| | | *(already tries the `compilerSend` callable first; falls back to Calla only on not-found)* | |
| Planner.html ×3 | send all rotas; send one person's rota; gather availability | address-book members | **4 PDFs + 2 .ics per email** (B1, B2) |
| SundayServicePlanner.html | Email Team | roster + Core Team | – |
| youthserviceplanner.html | Email Team | roster + Core Team | – |
| youthapp2.html | Email Team | roster + Core Team | – |
| egbc-core-planner.js | Email Team (CoreTeamApp, app) | roster | – |
| egbc-core-rota.js | Gather availability | team members | – |
| hub-app.js ×2 | Youth Hub access codes, resend | the young person's household head (never the child) | – |
| egbc-email.js, through `EGBCChurch.send` | see the next list | | |

**The pages that send through `EGBCChurch.send`:**
- **events-admin.html:**
  - cancellations
  - invitations (address book, team, or small group)
  - offer a place
  - "Email everyone"
  - task notices
- **bookings-admin.html:**
  - payments and deposits
  - approve, decline, cancel and move bookings, with the booking's `.ics`
  - closures
  - invoices
  - the same messages also go from rooms.html, maintenance.html, egbc-app-office.js and egbc-app-maint.js
- **forms-admin.html:** forms; a one-off form to a typed name and address
- **kids-admin.html:** registration form, typed parent address
- **kids-checkin.html:** consent renewal; a visitor's full form, typed parent address
- **groups-admin.html:** accept or decline; "Message the group"
- **safeguarding.html:** concern to the lead, no details

**On the server**, Calla is still in three places:
- `index.js` `sendOne` (reminders and notifications)
- `public-mail.js` (`SEND_EMAIL_URL`, and `makeSender`'s Calla route and fallback)
- `mail-route.js`'s fallback

`id-token.js` exists only to sign calls to Calla. **egbc-nosend.js** lists the Calla URL to stub it on localhost.

**What's already built (Comms, C-28)**, in `mail-route.js`:
- known recipients (17 sources)
- no under-18 address
- the 2,000-an-hour cap across instances
- outline-only for Safeguarding
- `sendViaResend` **with attachments**, From `"<church>" <hub@mail.churchhq.co.uk>`, Reply-To the sender's choice or the enquiry address

So the protections exist. What's missing is the callable, the who-may rules on the server, and taking Calla out.

## The plan

### 1. One callable: `hubSend` (functions/hub-send.js, main window)

`hubSend({ source, to, subject, html, replyTo?, attachments?, ref? })` returns `{ ok, sent, failed: [{to, error}] }`.

Every call goes through these steps in order. The first one that fails ends it, with a refusal in plain words:

1. **Signed in, with an active hub record.** Otherwise `unauthenticated` or `permission-denied`.
2. **Who may send.** The page sends a `source`, and the server checks today's page rules for it (table below). Pages stop being the only check.
3. **Recipients:**
   - each one must be known (mail-route `checkRecipients`, plus the additions below);
   - no under-18 address;
   - at most 500 per call.
4. **The hourly cap.** `mail-route` `reserve()`, for the whole call.
5. **Send.** `sendViaResend`, **one email per recipient** (as the pages do now: nobody sees anyone else's address). Each goes to the outbox with `via:'churchhq'`, `source`, the caller's uid, and the attachments' names only.
   - A Safeguarding source is outline-only.
   - On the emulator nothing is sent; the outbox row is everything.

**Who may send, by source** (the same people as today's page guards):

| source | Who may call | Recipients must also be |
|---|---|---|
| `compiler` | master, Church office: anyone known. A team admin: their own teams' members (`compilerSend`'s rule, moved in). | – |
| `compilerTest` | as `compiler` | **the caller's own address only.** Today it's any typed address. |
| `rota` | leaders of Worship / Kids / Youth Worship / Core Team; Core Team | address-book members |
| `servicePlan` | Worship Team leader; Youth Worship; Core Team | address-book members |
| `youthCode` | master, or an admin of Kids Church / Youth Worship / Lazers / ReNu | the household head of a young person (checked on the server) |
| `event` | admin, or someone who runs that event (`ref` = the event) | that event's sign-ups, invitees or task people |
| `booking` | admin, or that site's bookings admins (`ref` = booking or site) | the booking's or charge's payer, or the site's office |
| `form` | admin of the team; Kids lead; Kids Church volunteer at check-in | the `formRequests` / family record, **written before sending**, as now |
| `group` | master, team admin, or that group's leader (`ref` = group) | the group's members or requesters |
| `safeguarding` | anyone signed in | **the server looks up the site's lead.** The page sends no address. |

**Known recipients gains `smallGroupMembers.email`.** Without it, "Message the group" and small-group invitations would be refused. The list no longer needs to match Calla's.

**Attachments.** Two kinds:
- **Inline base64**, up to 2 MB per call: the small `.ics` files.
- **Storage paths under `rota-temp/`**, for the rota PDFs. The Planner already uploads them there. The server reads them, attaches them, and deletes them.
  - This keeps each call far below the callable's 10 MB request limit, with 4 PDFs per email to dozens of people.
  - Rules: `rota-temp/` written only by the people who may send rotas. That's a storage.rules change, which goes live at switch-over like the rest.

### 2. The pages: one client, `EGBCEmail.send` → `hubSend`

- **`egbc-email.js`'s `send()`** calls `EGBCAuth.call('hubSend', …)` instead of `fetch`, with a `source`:
  - The events window's pages already go through `EGBCChurch.send`, so they move by adding `source` and `ref` to each call, mostly one word each.
  - `send` still never rejects. It now **returns the server's refusal words**, and the callers that show "Sent" whatever happened get fixed to say what really happened. Several do that today.
- **The ten direct senders** (Planner ×3, the three service planners, youthapp2, core-planner, core-rota, hub-app ×2) call `EGBCEmail.send` too: one place to send from, so one place to check.
- **EmailBuilder2** drops its Calla fallback. `compilerSend` stays as a thin wrapper that calls `hubSend`'s code, so nothing already deployed breaks.
- **egbc-nosend.js** keeps stubbing `api.resend.com` on localhost; the Calla addresses go from its list.

### 3. The server: Calla out

- **`index.js` `sendOne`** → `makeSender`.
- **`makeSender`** (`public-mail.js`) → Resend only:
  - the route list (`churchSettings/mailRoute.kinds`), the "shut" gate and the Calla fallback go;
  - `SEND_EMAIL_URL` goes.
- **`enews-send.js`**'s `via || 'calla'` → `'churchhq'`.
- **`id-token.js`** is deleted if nothing else uses it.

### 4. Checks, with breaks

- **check-hub-send** (emulator, functions):
  - a signed-out call is refused;
  - a sender outside a source's people is refused;
  - an unknown address is refused;
  - an under-18 address is refused;
  - the cap is enforced;
  - `compilerTest` is refused for anyone else's address;
  - the rota PDFs arrive as attachments (outbox names);
  - a Safeguarding body is not kept.
- **check-no-calla** (static): no `sendemail-irkwdhx3xq`, `cloudfunctions.net/sendemail` or `a.run.app/sendemail` in any v2 page, script or function.
  - **The break:** put one direct fetch back in Planner.html → red.
- **A browser check:** Planner "Send one rota" and a bookings email each land in the outbox through `hubSend`.
- **Existing checks updated:** check-mail-route (the route list and fallback go), the senders' own checks, and 375px for any words that change.

## One decision for Martin before I build

**Where the Resend key lives before switch-over.**
- Today it can only go in the key box (`privateSettings/churchHqMail`), and the box refuses to save until switch-over. Until the rules are locked, the live database can be read by anyone.
- With Calla taken out, **v2 sends no email at all until switch-over.** Every send would be refused with "Email starts when the church switches over".

Three ways:

1. **(Recommended)** Keep the key in **Secret Manager as `RESEND_API_KEY`**, as with `DAILY_API_KEY`. Martin pastes it once; only the functions can read it, so it's safe now. The key box later shows "saved" or "not saved" from the server.
2. Keep the key box as the only home, and accept no v2 email until switch-over.
3. Keep Calla until switch-over. **Ruled out by the instruction.**

Martin's word is also needed that **Church HQ's Resend domain (mail.churchhq.co.uk) is verified.** The plan assumes it is (CHURCHHQ-EMAIL-SETUP.md).

## Who changes what

- **Main window:**
  - hub-send.js, index.js, egbc-email.js
  - the direct senders on my pages (Planner, the service planners, youthapp2, core-planner, core-rota, hub-app)
  - EmailBuilder2's fallback
  - the checks
- **Comms (please confirm):**
  - mail-route.js and public-mail.js `makeSender` (theirs and the events window's) to Resend only
  - adding `smallGroupMembers` to KNOWN_SOURCES
  - enews-send
  - Or I make those edits, if Comms prefer.
- **Events window:** a `source` and `ref` on each `EGBCChurch.send` call, and honest result words on their pages. A request goes to FINDINGS-events once this plan is agreed.

## Deploys when built

- **Functions:** `hubSend`, `compilerSend`, and every function that sends mail (they share `makeSender`). In practice, **all hub functions**.
- **Rules:** storage.rules for `rota-temp/`, at switch-over as usual.
