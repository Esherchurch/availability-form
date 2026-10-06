# EGBC Events & Room Booking — build brief

For a Claude Code window working in this repo (`Esherchurch/availability-form`, the `v2/` platform).
Written 2026-10-06. Martin writes no code: this brief is the spec, you build, he assesses.

**Work one chunk at a time. Chunk 1 only, then stop and report (see §9).**

---

## 1. What we are building, in one sentence

A stand-alone **events, sign-ups and room booking** module inside the v2 Team Hub — good enough that EGBC would not want ChurchSuite (formerly ChurchApp) — with a clean hand-off point so it can later talk to **Calla Accounts**, but never depend on it.

## 2. What we are NOT building (now)

- **Online card payments.** Phase 1 records what is owed and how it was paid (on the day, bank transfer, cash, cheque, invoiced). Stripe comes later (§8).
- **Anything inside Calla Accounts.** This module produces charges and an export (§6.6). Wiring it into Calla is a separate brief in the Calla repo.
- **A rewrite of the rota.** The existing rota (`events` collection, Planner/CoreTeamApp) stays as it is. See §5.1.
- Door display tablets, check-in auto-release, door-code locks, Google Calendar two-way sync.

## 3. Decisions already made by Martin (do not reopen)

| Question | Decision |
|---|---|
| Payment at first | Record it, pay later. Card payments in a later phase. |
| Who can sign up for events | Anyone. Public events: guests sign up with name + email, no account. Members-only events need the hub login. |
| Who can request rooms | Members from the hub, and outside hirers through a public request form. |
| Who approves bookings | A bookings admin (one or more people) per site. Core Team can always approve. |

Rooms, as a starting list (all must be **renameable** — Martin does not yet know what the church calls them):
Online, Main Sanctuary, Creche Room, Upper Main Room 1, Upper Main Room 2, Upper Main Room 3, Pastors Office, Garden.

Must handle **multiple sites**, and **outside venues** found by lookup (e.g. carols at a pub).
Must capture **whether AV is needed, whether refreshments are needed, and whether there is a charge**.

## 4. The platform you are building on

Checked in the repo on 2026-10-06 (re-check anything you rely on):

- **Static pages on GitHub Pages**, `https://esherchurch.github.io/availability-form/v2/`. One self-contained HTML file per page, vanilla JS, no build step. Match that. **Pushing to `main` deploys.**
- **Firebase project `egbc-worship-planner`**: Firestore + Storage. Auth is **email link or Google** (`v2/login.html`).
- **`v2/egbc-auth.js`** — `EGBCAuth.require()` returns the signed-in profile (`name`, `email`, `memberId`, `teams`…); also `isMaster()`, `isAdminOf(team)`, `effectiveTeams()`, `TEAMS`, `db`.
- **`v2/egbc-guard.js`** — `data-team`, `data-role`, `data-admin="any"` to protect a page.
- **`v2/egbc-shell.js`** — the EGBC bar on every page (`data-title`, `data-width`).
- **`v2/firestore.rules`** — helpers `signedIn()`, `active()`, `onTeam()`, `isMaster()`, `adminOf(team)`, `isAdmin()`. Users mirror `teams`, `adminFor`, `masterAdmin` from the address book.
- **`v2/firestore-rules.test.mjs`** + `v2/firebase.json` emulator config (Firestore on 8181). Rules are tested against the emulator — **every new rule gets tests here.**
- **Email**: the existing Cloud Run function `https://sendemail-irkwdhx3xq-uc.a.run.app`, POST JSON `{ to:[...], subject, html, replyTo, attachments:[{filename, content(base64)}] }`. See its use in `v2/Planner.html`.
- **ICS**: `buildICS()` in `v2/Planner.html` already writes RFC 5545 with line folding and video links. **Reuse its approach; do not write a second, different ICS writer** — move it into a shared `v2/egbc-ics.js` and have Planner import it, rather than copying it.
- **Video meetings**: `v2/meeting.html?room=<room>&event=<id>` (Daily.co). Room list `VIDEO_ROOMS` in `meeting.html`, `CoreTeamApp.html`, `Planner.html`, `hub-app.js`.
- **Team Hub**: `v2/hub.html` + `v2/hub-app.js` (home cards, notices, "Where to?" page registry in `hubPages`).

Establish, do not assume:
- **Where the `sendemail` Cloud Run source lives** and whether you can change it. If it is not in this repo, say so in your report; do not go looking in other projects.
- **Whether `v2/firestore.rules` is the deployed ruleset**, and how it is deployed. **Do not deploy rules.** Martin deploys, after you show the tests passing.
- Whether Firebase App Check is on, and which Firebase plan the project is on.

## 5. Shape of the thing

### 5.1 Two calendars, one view
The rota's `events` collection (services, practices, team meetings) is **not** touched. The new module uses **its own collections** (below) — do not name anything `events`. The booking calendar must still **see** rota services as occupying a room, so a hirer cannot book the Main Sanctuary over Sunday worship: a setting maps rota event types to rooms (e.g. Sunday Morning Worship → Main Sanctuary, 08:00–12:30), read-only, shown as "Church service".

### 5.2 Where things happen
| Page (new, in `v2/`) | Who | What |
|---|---|---|
| `whatson.html` | Public | Calendar/list of public events, filter by site; event page with sign-up. Embeddable. |
| `signup.html?e=<id>` | Public | Sign-up / tickets for one event. |
| `my-signup.html?k=<key>` | Guest | View, change or cancel their own sign-up via a private link from their email. |
| `rooms.html` | Members | Room calendar (day/week by site), request a booking. |
| `book.html` | Public | Outside hirer's booking request form. |
| `my-booking.html?k=<key>` | Hirer | Status, details, charges, terms accepted, cancel request. |
| `events-admin.html` | Event leaders / admins | Create and manage events, ticket types, questions, attendees, export. |
| `bookings-admin.html` | Bookings admins | Approval queue, clashes, charges, hirers, setup sheet. |
| `places-admin.html` | Admins | Sites, rooms, resources, venues, rate cards, booking types, terms. |

Add the member/admin pages to the hub's "Where to?" registry the way existing pages are registered.

## 6. Features

Must = this build. Should = this build if the chunk allows, otherwise recorded. Later = not now.

### 6.1 Places
- **Sites** (Must): name, address, postcode, lat/lng, active, order. Multiple sites.
- **Rooms** (Must): belong to a site; **name is editable at any time** — everything refers to rooms by id, never by name. Capacity, description, photo (Storage), accessible (yes/no), colour, active, order, bookable by members / by hirers.
- **Online** is a room of kind `online` (no site) carrying a `videoRoom` from `VIDEO_ROOMS`; joining goes to `meeting.html`.
- **Resources** (Must): e.g. projector, PA, chairs, urn, tea & coffee. Quantity, or **unlimited** for consumables; optional home room. Clash warning when quantity exceeded.
- **Outside venues** (Must): type-ahead lookup, saved once and reused (e.g. "The Bear, Esher"). See §7.3.
- Should: room **layouts** (theatre, cabaret, boardroom…) with an optional diagram image; **blackout periods** per room/site.

### 6.2 Events
- Create / edit / cancel (Must). Title, description, image, category & colour, start/end, **location = room(s) on a site, an outside venue, or online**, organiser, visibility **public / members-only / team-only (teams)**.
- **Recurring series** (Must) with per-date exceptions.
- **Needs AV?** and **Needs refreshments?** (Must) — become requests on the room booking that the event creates (§6.4).
- Creating an event in a room **creates the room booking** for it and goes through the same clash check.
- Public ICS feed of public events (Must); private per-person feed (Should).
- Cancelling an event emails everyone signed up (Must).

### 6.3 Sign-ups and tickets
- **Sign-up on/off per event**, with **event capacity** (Must).
- **Ticket types** (Must): name, price (0 = free), per-type capacity, sale window, how paid: `free`, `pay_on_day`, `invoice` (and later `online`).
- **Custom questions** per event (Must): text, choice, yes/no, number; required or not; per booking or per attendee (e.g. dietary needs, age for kids events).
- **Guests** sign up with name + email (+ phone optional) — no account. **Members** signed in are pre-filled and linked by `memberId`.
- **Multiple attendees in one sign-up** (Must) — a family books 2 adults + 3 children.
- **Waiting list** with automatic offer when a place frees up (Should — ChurchSuite does not appear to have one; this is a differentiator).
- **Confirmation email** with an `.ics` attached and the private manage link (Must). Leader can resend.
- **Attendee list, CSV export, mark attended** (Must). QR check-in from the email (Should).
- **Optional donation** as a separate line from the ticket (Should). Keep it separate because tickets and payment for services are not Gift Aid eligible but a genuinely optional extra donation can be (HMRC: https://www.gov.uk/guidance/gift-aid-what-donations-charities-and-cascs-can-claim-on). Record a Gift Aid declaration only against the donation line. Do not put a regulation number in the code or UI.
- Capacity must hold under two people booking the last place at the same moment — see §7.2.

### 6.4 Room bookings
- **One calendar** for event bookings, member bookings, hire bookings and rota services (Must). Day and week views per site; room rows.
- **Booking request** (Must): rooms (one or more), date/time, **setup and pack-down time** (buffers), attendee numbers, layout, **AV needed** (what), **refreshments needed** (what, how many), resources with quantities, booking type, notes.
- **Booking types** (Must), editable: e.g. Church event, Ministry meeting, Private hire, Wedding, Funeral, Community group. Each sets: who may use it, whether it is chargeable, its rate card, its questions, its terms.
- **Statuses** (Must): `requested` → `approved` / `declined`, then `cancelled`; `provisional` holds the room while pending.
- **Clash detection** (Must) across all bookings + rota services, **including buffers**, per room and per resource quantity. A clash can be overridden only by a bookings admin, with a reason.
- **Recurring bookings** (Must) — weekly toddler group — with per-date exceptions and a clash report for the whole series before approval.
- **Approvals** (Must): bookings admins **per site** (stored on the site, as member ids). Core Team (`isMaster()` / admin) can always approve. Member bookings of free rooms with no clash: setting per booking type — auto-approve or needs approval.
- **AV and refreshment requests** route to a named team or person per site (Should) with a **notice period** (e.g. refreshments need 3 days) enforced on the request form.
- **Caretaker / setup sheet** (Should): printable day/week list of what to set up where, with layout, AV and refreshments.
- Ministry **cost codes** on internal bookings (Later).

### 6.5 Hire and charges
- **Hirers** (Must): organisation or person, contact, invoice address, charity yes/no, regular hirer yes/no, notes.
- **Rate cards** (Must): per room × booking type; per hour / per session / per day; **standard, charity and regular-hirer rates**; minimum charge; resource and refreshment add-on prices.
- **Charges calculated automatically**, editable by an admin before approval (Must). Hidden from the hirer until approved.
- **Deposits** (Should), including refundable damage deposits (Later: refund workflow).
- **Terms and conditions** (Must): per booking type, versioned. The hirer must tick to accept; store version + timestamp + name. (ChurchSuite and Hallmaster do not visibly do this.)
- **Payments recorded manually** (Must): amount, date, method (cash, cheque, bank transfer, card on the day), reference. Paid / part-paid / unpaid.
- Hirer's **booking page** shows status, charges, due dates, paid status (Must).
- Invoice numbers and PDF invoices: **Should**, but see §6.6 — Calla Accounts may become the invoicer; design so either can.

### 6.6 The Calla Accounts boundary (stand-alone first)
Calla Accounts is Martin's own accounting software, in a separate repo. **This module must work fully without it** — on its own, with no accounting system at all — and must never fail, slow down or lose data because Calla is absent or unreachable. Build the seam, not the integration:
- Every money line is a **`charges`** document: who owes, what for (booking/sign-up id), amount, VAT flag, due date, status, payments.
- An **accounts export**: CSV and JSON of charges and payments in a date range, with a stable id per line and an `exportedAt` stamp so nothing is exported twice.
- Leave a single place (`v2/egbc-accounts.js`, interface only) where a future Calla connector will plug in. **Do not guess at Calla's API**; it is a separate brief.

### 6.7 Notifications (email via the existing function)
Must: sign-up confirmation; booking received (to hirer); new request / clash (to the site's bookings admins); approved / declined / cancelled (to requester); event cancelled (to attendees).
Should: reminder N days before; unpaid-charge reminder; waiting-list offer.
**Establish** whether anything can run on a timer (reminders need one). If not, record it as a finding — do not build a scheduler.

### 6.8 Reports
Must: bookings by room and date; charges paid/unpaid; sign-ups and attendance per event (CSV).
Should: room use by week; income by room and hirer.

## 7. Technical rules

### 7.1 Data (new Firestore collections — suggested; record any change and why)
`sites`, `rooms`, `resources`, `venues`, `bookingTypes`, `rateCards`, `terms`, `hirers`,
`calEvents` (+ subcollections `ticketTypes`, `questions`), `signups`, `capacity/{calEventId}`,
`bookings`, `charges`, `bookingSettings/{siteId}`.
Times stored as ISO strings in **Europe/London** local time plus a UTC timestamp; all-day flag. Rooms referenced by id.

### 7.2 Public writes without a login
Guests and hirers write without an account, so the rules carry the weight:
- Public **create only**, never list. Each guest record has an unguessable `manageKey`; the manage pages read by key.
- Rules validate shape: allowed fields only, string lengths, status forced to `requested`/`pending`, no charges written by the public.
- **Capacity**: a sign-up is written in a batch with an increment to `capacity/{calEventId}`; the rule uses `getAfter()` to require the new total ≤ capacity and = old total + places taken. Prove it with an emulator test that books the last place twice.
- Basic spam defence: honeypot field + minimum fill time. Record whether App Check would help; do not enable it.

### 7.3 Venue lookup
- Type-ahead with **Photon** (`photon.komoot.io`, free, OSM data, attribution required); **postcodes.io** to check a postcode and get coordinates; always allow **manual entry**.
- Save chosen venues to `venues` so the next event reuses them.
- Do not use the public Nominatim server for type-ahead (its policy forbids autocomplete). getAddress.io has shut down. Google Places would find pubs better but needs a billing account — record as an option, do not set it up.

### 7.4 Non-negotiables
- **Synthetic data only.** Test and develop against the emulator with made-up people. Never read, copy or test against the live `addressBook` or any real person's record. If you think you need real data, describe its shape and seed that.
- **No change may lock anyone out.** Existing pages, rules and collections keep working. New rules are additive.
- **Do not deploy Firestore rules.** Show tests passing; Martin deploys.
- Every page works on a phone at 375px and in the hub app.
- Reuse before build: `egbc-auth.js`, `egbc-guard.js`, `egbc-shell.js`, the email function, the ICS writer, `meeting.html`. Name it, do not write a second one.
- UK spelling, UK dates (Tue 20 Oct), 24-hour times.
- Ambiguity goes in `v2/FINDINGS-events.md`; take the reading that builds least and carry on. Only stop if you cannot proceed.

## 8. Later phases (not in this build)
Stripe card payments (Checkout Session from a server function + webhook marking `charges` paid; Payment Links as a stop-gap), Calla Accounts connector, early-bird/discount codes, door tablet, check-in auto-release, multi-stage approval, Google Calendar sync, cost codes.

## 9. Chunks — do Chunk 1, then stop and report

Each chunk has three stages. **Gate at the end of each stage**: fix what the gate finds, then go on.

### Chunk 1 — Places (sites, rooms, resources, venues)
1. Collections + rules + emulator tests for `sites`, `rooms`, `resources`, `venues`, `bookingSettings`. Admin-only write; members read; public read of active sites/rooms only.
2. `places-admin.html`: add/rename/reorder/deactivate sites and rooms, resources with quantities, per-site bookings admins, venue lookup (§7.3). Seed button for the starting room list in §3 (Online + seven rooms on one site called "Esher Green" — renameable).
3. Rename proof: rename a room and show nothing that refers to it breaks.

### Chunk 2 — Events and sign-ups
`calEvents`, ticket types, questions, guest and member sign-up, capacity rule, waiting list, confirmation email + ICS, attendee list/export, `whatson.html`, `signup.html`, `my-signup.html`, `events-admin.html`.

### Chunk 3 — Room bookings
Calendar views, request forms (member + public `book.html`), buffers, resources, AV/refreshments, rota services as busy, clash detection, approvals per site, recurring, emails, setup sheet.

### Chunk 4 — Hire and charges
Hirers, rate cards, terms acceptance, automatic charges, manual payments, hirer page, accounts export, reports.

### Each gate report says five things
1. **What was built**, as a list of files.
2. **Deliberate breaks** you made and which test caught each (e.g. remove the capacity check → which test fails).
3. **The lock-out check**: how you proved existing pages and rules still work.
4. **Found and not fixed**, each with a number in `v2/FINDINGS-events.md`.
5. **The one proof that matters** for that stage, named on its own.

---

Chunk 1 is first. Report after it and wait.
