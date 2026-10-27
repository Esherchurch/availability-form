# Findings — events, bookings and places build

Numbered for the Code windows. Each one says what was checked, what was found,
and whether it was acted on. Nothing here was asserted from memory: every claim
about existing code was made after opening the file named.

Opened on 2026-10-06 during Chunk 1 (Places).

---

## Acted on, because it blocked the build

### F-001 — `egbc-auth.js` pointed the local emulator at the wrong port — FIXED
`firebase.json` puts the Firestore emulator on **8181**, with a comment saying
8080 was given up because the monitor bridge sits there. `egbc-auth.js` still
called `db.useEmulator('localhost', 8080)`. Every page served from localhost was
therefore pointed at a port the emulator is not on, so local development silently
had no database.

`firestore-rules.test.mjs` already avoids this by reading the port out of
`firebase.json`; a browser page cannot, so the number is now written there with
a comment saying why. Localhost-only, so nothing deployed changes.

**Fixed** in this chunk — without it nothing in Chunk 1 could be exercised at all.

---

## Decisions taken, and why

### F-002 — `resources` was already taken, so bookable kit is `bookableResources`
§7.1 suggests a `resources` collection for projectors, the PA, chairs and urns.
That name is live: `resources.html` reads it (`const COL='resources'` at line 124),
`data-tools.html` lists it among the collections it backs up, and `firestore.rules`
already has a `match /resources/{itemId}` for the team document and link shelf.

Reusing it would have put charters and chairs in one collection under one set of
rules. The new collection is **`bookableResources`**. Renamed on the new side
because the shelf is live and this is not.

### F-003 — bookings admins and the safeguarding lead live in `bookingSettings/{siteId}`
§6.4 says bookings admins are "stored on the site, as member ids"; §7.1 lists a
separate `bookingSettings/{siteId}`. Took §7.1, because Chunk 4 will want more
booking settings per site than belong on a site record. The site document holds
only what a site is; who runs it is alongside.

### F-004 — a room photo is a pasted URL, not an upload
§6.1 lists "photo (Storage)" for a room. `storage.rules` has no `rooms/` path and
ends `match /{allPaths=**} { allow read, write: if false; }`, so an upload needs a
new Storage rule — and the brief says not to deploy rules. The field is
`photoUrl` and takes a link. Upload is a one-rule change whenever Martin wants it.

### F-005 — `venues` are members-only for now
§9 stage 1 says "public read of active sites/rooms only", so saved outside venues
are not public. Chunk 2's public event pages will need to name the venue of an
event at a pub. Two ways: widen the `venues` rule to active-only public read, the
same shape as rooms, or copy the venue name onto the event when it is created.
**Not decided here** — it belongs with whoever builds `whatson.html`.

---

## Recorded, not fixed

### F-006 — `EMULATOR.md` does not exist
`firestore-rules.test.mjs` line 20 and `egbc-auth.js` line 71 both say "see
EMULATOR.md". There is no such file anywhere in the repo. There is therefore no
checked-in instruction for how to run the rules tests, which is why this chunk
had to work it out and add `v2/package.json`.

What works, for the next window:

    cd v2
    npm install
    npx firebase emulators:exec --only firestore --project demo-egbc "node firestore-rules.test.mjs"

### F-007 — `login.html` cannot sign in against the emulator
`login.html` builds the `egbc` named app itself (line 125) and never loads
`egbc-auth.js`, so the localhost emulator hook in F-001 does not apply to it: on
localhost it reaches for live auth. Local work therefore cannot sign in through
the real login page.

Chunk 1 worked around it with a throwaway same-origin page that loads
`egbc-auth.js` and calls `signInWithEmailAndPassword`. Nothing was added to the
repo for it. A permanent fix is three lines in `login.html` — the same hostname
check — but it is a live sign-in page and was left alone.

### F-008 — any team admin can rename or close any room
The new rules gate writes on `isAdmin()`, which `firestore.rules` defines as
"administers something, anything" (`me().get('adminFor', []).size() > 0`). So the
Kids Church admin can rename the Main Sanctuary or take it out of use, and that
changes what every other team can book.

§5.2 says `places-admin.html` is for "Admins" and does not narrow it, so this
matches the brief. If it should be Core Team only, it is one word —
`isAdmin()` becomes `isMaster()` in the five new blocks, and `data-admin="any"`
becomes `data-team="Core Team" data-role="admin"` on the page guard. **Martin's
call, not a defect.**

### F-009 — a public list must filter on `active`, or it is refused outright
The rules read `resource.data.active`, so the engine only passes a list query it
can prove in advance. `collection('rooms')` without a login is **denied entirely**,
not filtered down to the active rooms. A public page must ask for
`.where('active','==',true)`.

Two tests pin this either way, so a page written the lazy way fails loudly rather
than returning nothing and looking empty. Chunks 2 and 4 must write their public
queries this way.

### F-010 — `VIDEO_ROOMS` is duplicated, and the brief has it slightly wrong
§4 says the list is in `meeting.html`, `CoreTeamApp.html`, `Planner.html` and
`hub-app.js`. Checked: it is declared in three of those, **not** in `hub-app.js`,
which uses `VIDEO_DEFAULT_BY_TYPE` and `videoRoomFor()` instead. The three are
also not the same shape:

| File | Shape |
|---|---|
| `meeting.html:70` | object, `{slug: label}` |
| `Planner.html:52` | array of `[slug, label]` pairs |
| `CoreTeamApp.html:2359` | array of `[slug, label]` pairs |

`places-admin.html` adds a fourth copy, in the `meeting.html` object shape.
It should become one shared file, but that touches three live pages and would
have to reconcile two shapes, so it is parked here rather than done inside a
chunk about rooms.

### F-011 — an admin's first-ever sign-in may be refused, needs confirming
Seen in the emulator: with no `users/{uid}` document, signing in as somebody whose
address book record carries `masterAdmin: true` failed with `PERMISSION_DENIED`
on `users/{uid}`, for both create and update.

Reading the rules, that is what they say: `allow create` requires
`status == 'pending'` and `teams.size() == 0`, but `provisionProfile()` in
`egbc-auth.js` writes an active record with teams for a matched admin, and the
`isMaster()` and `isAdmin()` branches both need a `users` record that does not
exist yet.

The deploy note at the top of `firestore.rules` says to deploy only once everyone
has signed in at least once, which would have hidden this for the existing team.

**Not investigated further** — it is outside Chunk 1, and it was met while chasing
a project-id mismatch rather than reproduced deliberately. Worth a clean
reproduction before anybody acts on it. It would bite a brand-new admin.

### F-012 — `v2/package.json` added so the tests can be run
There was no `package.json`, so `@firebase/rules-unit-testing`, `firebase` and
`firebase-tools` had to be installed to run the rules tests at all. Added, with
`package-lock.json`. `node_modules/` was already in `.gitignore`.

---

## Establish items from §4

| Asked | Answer |
|---|---|
| Where the `sendemail` Cloud Run source lives, and whether it can be changed | **Not in this repo.** The URL appears only as a call site in `Planner.html`, `CoreTeamApp.html`, `EmailBuilder2.html`, `SundayServicePlanner.html`, `hub.html` and `hub-app.js`. There is no `functions/` directory and nothing tracked that builds or deploys it. Not gone looking elsewhere, as instructed. |
| Whether `v2/firestore.rules` is the deployed ruleset, and how it is deployed | **Not established.** The file carries `firebase deploy --only firestore:rules --project egbc-worship-planner` at the top, so deployment is a manual CLI step. Whether what is live matches this file cannot be told from the repo. Nothing was deployed. |
| Whether App Check is on | **Not initialised client-side.** The only `appCheck` matches in the tree are inside `node_modules` — the SDK itself. No project file initialises it. Whether it is *enforced* on the project is a console question the repo cannot answer. |
| Which Firebase plan the project is on | **Not established from the repo.** Nothing records it. The existing Cloud Run email function implies billing is enabled, but that is an inference, not a reading. |

---

## Default periods used, where the brief said to record them

Nothing in Chunk 1 holds personal data, so no retention default was needed yet.
§6.13 wants form answers to carry one; that lands in Chunk 3.

### F-013 — a hub with no registry applied reads "0 tools" for every team
Found while running the lock-out check after A2, and it is not caused by A2 —
`hub.html` loads none of the files that changed.

`REGISTRY` in `hub-app.js` is a seed list, not the menu. The hub renders from
the `hubPages` collection, and the team picker counts `PAGES` alone, so against
a database where no master admin has pressed "Add the missing pages" every team
in the picker reads "0 tools" and the tools list says "Nothing here yet" — on a
site with 30 pages registered in the file. `BUILT_IN_PAGES` holds one entry
(Meetings), which is the one tile that does show.

Live is not in that state. A fresh database is, and so is every emulator run
after a reset, which is how this surfaced.

The check itself was also wrong, and that is fixed: `lockout.js` read the hub's
text while the team picker was still up, where no tile can be seen. It now
chooses a team first, the way a person would. With the registry applied it
reports the Places tile listed, and 7/7 pass.

---

# Chunk 2 — events and sign-ups

### F-014 — the email function is open to anyone, and a public page now calls it
`sendemail-irkwdhx3xq-uc.a.run.app` takes a POST with `to`, `subject` and
`html` and sends it. There is no key, no sign-in and no App Check on it. That
was already true — seven pages in the repo call it, and the function has been
live for months — but until now every caller was behind a login. The sign-up
confirmation is sent from a guest's browser, so the address of a working
open relay is now in a page anyone can read.

Not fixed here: the fix is a server change and Martin deploys those. The two
honest options, in order:
1. Make the function require an App Check token or a Firebase ID token, and
   send guest confirmations from a small callable function instead of the page.
2. Failing that, rate-limit by IP and cap the recipients per call.

Nothing in this chunk is blocked by it, and no new page sends to an address
the person using it did not type.

### F-015 — three things in the brief need a server, and there is none yet
Each is built as far as a browser can take it, and each is named on the page
so nobody is misled:
- **A public calendar feed.** §6.2 asks for an ICS feed of public events. A
  feed is a URL that keeps serving and keeps changing; that is a server.
  What's On offers "Add to calendar", which downloads the events showing as a
  file. It is a snapshot, not a subscription.
- **An automatic waiting-list offer.** §6.3 asks for the offer to go out when
  a place frees. Nothing client-side can do it: the person who cancels is a
  guest, and a guest cannot read the waiting list — nor should they. So the
  admin page lists the waiting list and offers a place in one press, and the
  email goes then.
- **Website embeds** (§6.17, a Should): not built. A list, a month and a
  featured strip for the church website are three small public pages, but
  they want a cacheable endpoint to be worth anything.

All three fit one small Cloud Functions chunk, with F-014's fix. Worth
proposing as its own step rather than smuggling into an events chunk.

### F-016 — the Storage rule for event pictures checks sign-in, not admin
`storage.rules` has no view of the address book, so `events/{id}/{file}`
allows any signed-in person to write a picture, the same as `banners/`. The
event document those pictures belong to is admin-only, and the page only
offers the control to an admin, but the rule itself is weaker than the rule
beside it. Firebase can call Firestore from Storage rules on newer versions;
worth doing when someone is next in that file.

### F-017 — `places-admin.html` is off `DESIGN.md`, because it predates it
Chunk 1's page is Montserrat, with pill tabs, 10px labels in 800 weight and
capitals. The pages in this chunk follow the guide from the first line, so
they add nothing to R-012 or R-013 — but Places is now the odd one out among
the new pages. It belongs in step A3 with the rest of the controls work.

### F-018 — rota parity: what the planners already do, and what they do not
The survey §6.17 asks for, read from the code rather than guessed:

**Already there**
- Availability per person per date — the whole point of the availability form.
  `availability/{eventId}/{memberId}` holds `avail` / `not-avail`, and the
  Planner and CoreTeamApp both show Available, Declined and Pending buckets.
- Sign-off per team per term (`rotaSignoff`), which ChurchSuite has no
  equivalent of.
- A cap on how often someone serves: `maxFrequency` on their address book
  record, used when a term is auto-populated.
- Moving someone between roles by dragging, which the code calls a swap.

**Not there at all**
- **A person accepting or declining a date they are already on.** They can say
  in advance that they are unavailable; once they are on the rota there is no
  "I can't do this one" route.
- **Swaps between people.** The drag-and-drop "swap" is an administrator
  moving two names. A member cannot ask another member to take their date.
- **Members signing up to open rota dates.**
- **Reminders.** Nothing sends anything before a date. Not a line in any file.
- **A clash report** — the same person on two things at once.
- **"Not on any rota"**, **serving frequency** and **personal serving history**
  reports.

**Also found:** the declined state is spelled two ways. `view-only-rota.html`
and the Planner both test for `'unavailable'` *or* `'not-avail'`, so the
data holds both. It works because every reader checks for both, which is one
reader away from a bug.

**Proposed "Rota parity" chunk, for Martin to approve** — not built, and not
inside an events chunk:
1. Accept or decline a date you are on, from the rota and from the hub's
   "Waiting for you" card.
2. Ask someone to swap; they accept; both rotas change together.
3. Reminders at a set time (this needs the server from F-015).
4. The three reports: clashes, not on any rota, serving frequency.
5. One spelling for declined, with the readers left tolerant of both.

### F-019 — a composite index is needed before this goes live
What's On asks for the events whose `audience` includes one of mine, from now
on, soonest first. Firestore will not run that without an index; the emulator
invents one as it goes, so it only bites in production. It is written into
`firestore.indexes.json` and deploys with the rules. **Martin deploys.**

### F-020 — three hand-rolled calendar writers remain, and seven copies of the email URL
`egbc-ics.js` and `egbc-email.js` are the one copy of each from now on, and
the four new pages use them. The existing copies are untouched: the ICS
writers in `birthday.html`, `Planner.html` and `worshiphubapp.html`, and the
`SEND_FUNCTION_URL` constant in `CoreTeamApp.html`, `Planner.html` (three
times), `SundayServicePlanner.html`, `youthserviceplanner.html` and
`hub-app.js`. Moving a live rota page onto a new module is not a change to
make in passing; it is an hour with the walk-through to prove it.

### F-021 — editing one date of a series does not offer "all dates"
A repeat makes each date as its own event joined by `seriesId`, so one date
can move or be cancelled without the others — which is the behaviour that
matters. What is missing is the other direction: changing the title once and
having it change on all of them. Deleting the whole series is offered;
editing it is not.

### F-022 — what stops a bot filling in the sign-up form
A hidden field no person sees, and a form submitted in under two and a half
seconds, are both refused. The rules cap every field's length and allow only
the fields a sign-up has. That is the whole of it.

App Check would help and is **not** enabled, as the brief says. Recorded as
the option it is: it would also give F-014's function something to check.

### F-023 — the 32-page smoke test is not in the repo
`EVENTS-WINDOW-BRIEF.md` §7 asks each report to show the main window's
32-page smoke test still passes. No such script is committed (`PARITY-AUDIT.md`
names a `smokeall.js`, which is not in `v2/` either), so the events window
cannot run it. **Request for the main window:** commit the smoke script, with
the port it serves on as a setting, so both windows run the same check.
Until then the E0 report proves the lock-out another way: a page on any port
other than 5601 still reports 8181 / 9099, and both rules suites pass in full.

## Chunk 3, stage 1 (E1): check-in and attendance

### F-024 — check-in is for admins until stage 3 brings event leaders (settled in E3)
**Settled in E3.** An event's named leaders now use check-in for that event
without being admins, and the rules allow exactly that. The original note follows.

Check-ins, the roll-call, registers and downloads all need an admin. The rules
have no "leader of this event" yet (that is E3), and a check-in holds names,
times and who collected a child. A volunteer at the door who is not an admin
cannot check people in until then. Leaders are added by hand at the door
("Leader" button), not yet read from the rota.

### F-025 — fixed (617dceb, reviewing window): the page header dropped the address's `?…`
**Fixed.** The reviewing window changed `egbc-shell.js` to keep the rest of the
address. The E1 test now opens the guest's real email link in a brand-new tab
and checks that the key survives the reload and the booking shows. Put the old
line back and that check fails. The original report follows.

`egbc-shell.js` `checkFresh()` reloads a page once per tab when `version.json`
differs from the page's own stamp, and does it with
`location.replace(location.pathname + '?v=' + v.stamp + location.hash)`. That
throws away everything else after the `?`. Today every page's stamp differs
from `version.json`, so the first page in each new tab loses it:
- the "View or cancel your place" link in a confirmation email opens to
  "This link is missing its key"
- `signup.html?event=…` opens to "No event was named"
- `checkin.html?event=…` opens the event picker
- probably `meeting.html?room=…` and any other page with a `?` (not checked)

Shown by the E1 test (the KNOWN line): a fresh tab opening
`my-signup.html?key=anything` lands on `?v=202609041833`.
**Suggested fix:** keep the other parameters, e.g.
`var q = new URLSearchParams(location.search); q.set('v', v.stamp); location.replace(location.pathname + '?' + q + location.hash);`
Not mine to change: `egbc-shell.js` belongs to the main window.

### F-026 — fixed: adding a person to a sign-up wiped the answers already typed
On `signup.html`, questions asked "for each person" (allergies, age) were
redrawn empty whenever someone pressed "Add someone else" or removed a person.
Names were kept, answers were not. A parent who typed one child's allergy and
then added a second child sent the form with the allergy blank, without being
told. Fixed: the answers are put back when the list is redrawn. Nothing else on
the page changed. The E1 test checks it, and fails when the fix is taken out.

### F-027 — poor signal: check-ins wait on the phone only while the page stays open
The "Should" in §6.9. Firestore keeps writes made with no signal and sends them
when it comes back, and the check-in page says so in a banner. But
`egbc-auth.js` keeps that queue in memory, not on the phone, so closing or
reloading the page with no signal loses any check-ins not yet sent. The printed
register (with tick boxes) is the fallback. Making the queue survive a reload
means turning on Firestore's saved cache in `egbc-auth.js`, which would change
every page. Recorded for Martin; not requested.

### F-028 — not built in E1 (Should items)
- **Collection codes** (a short code at drop-off that must match at collection).
- **Name badges and labels** (printable A4 label sheets).
Both fit on top of what is here: the check-in record already has the place for
who collected and why.

### F-029 — medical answers: where they live until stage 2 and 3
Until the forms in E2, the "medical flag" at the door comes from ordinary
sign-up questions that an admin marks in Check-in settings. Those answers sit
on the sign-up record, as every answer does today.
- On the new Registers page, a medical column is off by default, and any
  download that includes one is logged (who, when, which columns) **before**
  the file is made: no log, no file.
- **But** the older "Download the list" button on the events page (Chunk 2)
  puts every answer in its CSV, medical ones included, with no log. I have
  left it as it is, because the new rule is not to change how an existing page
  behaves. Proposal for E3: that button either leaves out medical answers or
  goes through the same log.

**Done in E1, Martin's decision:** "Download the list" now leaves medical answers
out unless "Include medical details" is ticked, and a download that includes
them is logged first (who, when, which columns), the same as the registers: no
log, no file. Ticked, it also includes the answers asked for each person, which
it never did before. A download without medical answers is not logged, and
otherwise the button behaves as it always has.
**What counts as medical:** any question marked as a flag in Check-in settings,
**and** any question whose wording mentions allergies, medical, health,
conditions, asthma, diabetes, epilepsy, EpiPen, disability, additional needs or
first aid. So an allergy question nobody remembered to mark is still left out.
The Registers page uses the same rule. If a medical question is worded some
other way, an admin marks it in Check-in settings.

### F-030 — "sign up to the whole series" is a setting with nothing behind it
The events page lets an admin choose "Sign up to: the whole series", but
`signup.html` never reads that setting. Every sign-up is for one date (Chunk 2).
Series attendance therefore treats someone as the same person on different
dates when the bookings point at the same person record and the attendee has
the same name. Building whole-series sign-up is a Chunk 2 change for Martin to
approve.

### F-031 — REQUEST for the main window: hub entries for E1 (noted for the main window)
For the "Where to?" registry (`hubPages`), admins only:
- **Check-in**: `checkin.html` (icon `scan-line`). Opens a picker of today's
  and this week's events, and the roll-call.
- **Headcounts**: `headcounts.html` (icon `chart-column`).
The Registers page needs an event, so it is reached from the event, not the hub.

**Also, for the style check** (`tests/check-style-every-screen.mjs`, main window's
file): please add the events pages to its page list, so it covers them. Each
needs the screens it should open:
- `checkin.html?event=<id>`: the list; the walk-in, leader, check-out and
  settings sheets; the roll-call (`checkin.html?view=rollcall`).
- `attendance.html?event=<id>`: one screen.
- `headcounts.html`: one screen.
- `forms-admin.html` (E2): the list; the builder (`#newTpl` set to `parent`);
  the event's chase list (`forms-admin.html?event=<id>`); the answers sheet.
- `form.html?k=<key>` (E2, no sign-in): needs a request in the emulator. The
  E2 test (`screenshots/events/e2-forms.test.mjs`) shows how to make one.
- `safeguarding.html` (E3): the page alone (concerns, coming up); with
  `?event=<id>` (leaders, ratios, incidents); the sheets for adding a leader,
  the rota, checks, an incident and a concern. Best seen signed in as a
  safeguarding lead. The E3 test shows how to make one.
- `retention.html` (E3): master admins; one screen.
- `safeguarding-settings.html`: admins and safeguarding leads; one screen,
  plus the "already made" part after saving.
- `events-admin.html`, the new **Photos** tab (E4): links, a QR code open,
  photos waiting, approved and rejected.
- `upload.html?k=<link>` (E4, no sign-in): needs a link in the emulator. The
  E4 test shows how to make one.
- `hire.html` and `room.html?r=<room>` (Chunk 4 R1, no sign-in), and on
  `places-admin.html` the room **Profile** sheet and the new **Catering** tab.

And for the hub's "Where to?" list, admins only:
- **Forms**: `forms-admin.html` (icon `file-text`).
- **Safeguarding**: `safeguarding.html` (icon `shield-check`), for **everyone
  signed in**, because "Report a concern" is there. Leaders and leads see more.
- **Due for deletion**: `retention.html` (icon `archive`), master admins.

**And the logo** (`egbc-shell.js`, line 30): every page loads a 1 MB photo from
the storage bucket as the logo in the header. That is slow on a phone signal. A
small copy kept with the pages would load at once.
Nothing personal for "My EGBC" in E1. Later, a member's own sign-ups could show
their check-in code there.

### F-032 — scanning: what each phone uses
Chrome on Android reads QR codes itself. Everywhere else, including iPhones,
the page loads a small reader (jsQR, from jsdelivr) the first time Scan is
pressed, so that first press needs signal. A hand-held USB or Bluetooth scanner
that types the code and presses Enter into the "Find by name" box works too.
The camera only works on https or localhost; GitHub Pages is https. Searching
by name always works.

### F-033 — how a check-in code is made, and what it does not carry
The code is `EGBC1|<event>|<first 10 characters of the sign-up key>|<person number>`.
It never carries the whole key, because the whole key is the manage link: a
code photographed at the door must not let anyone cancel the booking. Ten
characters is still far too many to guess. QR codes are drawn by
`egbc-events-qr.js` in the page, not fetched from a QR website, so nobody else
learns who is coming.


## Chunk 3, stage 2 (E2): forms and consent

### F-034 — forms are sent by an admin, not when someone signs up
An admin presses "Send to … not yet asked" on the event's forms list. A family
that books after that press is not asked until the next press. The button says
how many are waiting, so the list shows it. Sending at the moment of sign-up
would mean the public sign-up page creating the request and checking for an
earlier answer, and that check has to see other people's answers. It needs a
server, or a rule-checked public write without the reuse check. Proposal for
Martin.

### F-035 — safeguarding leads who are not admins: the rules let them in, the page does not yet (settled in E3)
**Settled in E3.** `safeguarding.html` is the lead's page, whether or not they are
an admin, and check-in now takes collectors and medical flags from the consent
forms. The original note follows.

The rules already let a site's safeguarding lead or deputy list that site's
medical answers and open attached files, even if they are not an admin. The
tests prove it. But `forms-admin.html` is an admin page, so a lead who is not
an admin has nowhere to look yet. Stage 3 adds event leaders and gives leads
and leaders their view. Until then:
- check-in still takes collectors and medical flags from sign-up questions (E1)
- forms do not feed check-in yet
Stage 3 joins them.

### F-036 — template wording, and the default periods I used
The five templates are shapes with plain placeholder wording. EGBC supplies the
real wording and the policy behind it. **Defaults used, for Martin to confirm
or change** (each is a setting on the form):

| Template | Answer lasts | Kept after that |
|---|---|---|
| Parent or guardian consent | to the end of the school year (31 August) | 12 months |
| Trip or residential consent | that event only | 12 months |
| Leader or volunteer declaration | 365 days | 12 months |
| Hirer safeguarding | 365 days | 12 months |
| Health and access needs | that event only | 6 months |

Nothing is deleted automatically. Each answer carries its "delete after" date
for the retention list in stage 3. The leader declaration asks for the DBS
status and the date it was seen, and says in the form not to write the
certificate number. There is no field for one.

### F-037 — the page splits medical answers off; the rules check everything else
Which answers are medical is decided as the form is sent, by the rule Martin
approved in E1: questions marked medical, plus the keyword list. The rules then
make sure of everything around it:
- an answer belongs to the person, form, event and site its request names
- the request is marked done in the same write
- nothing can be added once the request is done
- answers can never be changed
- only master admins and the site's safeguarding lead can list the medical half

The rules cannot look inside an answer to check that no medical answer is in the
ordinary half. The tests prove the page splits them, and fail if the split is
taken out.

### F-038 — "first aid" makes the first-aid permission private
Because "first aid" is on the keyword list, the parent consent question "May a
trained leader give first aid?" is kept with the medical answers, and an
ordinary admin cannot see the yes or no. That follows the rule as approved. If
Martin wants first-aid permission visible to all admins, it is a change to the
keyword list.

### F-039 — not built in E2
- **Age band on sign-up** (§6.10: ask the date of birth or school year at
  sign-up and enforce the event's age band). That is a change to the sign-up
  form, so it belongs with stage 3 or Chunk 6.
- **Forms on ticket types and booking types.** Forms attach to an event. Ticket
  types only matter once an event has more than one, and booking types arrive
  in Chunk 4.
- **Downloading form answers.** Answers are read one booking at a time. A
  download would go through the same medical tick and log as E1.

### F-040 — the youth access codes, established
`youthGrants` holds a one-time code, the young person's name (`memberName`)
and the parent's email (`sentTo`). `youthAccess` records who redeemed it, so a
young person can open the youth pages. It links a young person to a parent's
email for app access. It does not record consent. Forms already get the same
link from the booking (the parent's email and the children's names), so I have
not built a second parent-child store. Reuse matches on that same email.

### F-041 — reuse needs the same email and every child named before
A family is asked "still correct?" only when an answer that has not run out came
from the same email and names every child on the new booking. A different email
or a new child means the full form again. That is the safe direction to be
wrong. "Something has changed" brings back the ordinary answers, but asks the
medical ones again, because that page cannot read them.

### F-042 — REQUEST for the main window: forms waiting on the personal dashboard
"Waiting for you" (ONE-APP-BRIEF §5) could list a member's open forms. That
needs a rule letting a signed-in member list their own requests (matched on
their email or member id), which I would add in the events section, plus the
dashboard tile, which is the main window's. Not done in E2.


## Chunk 3, stage 3 (E3): safeguarding

### F-043 — "still correct" medical details wait for the safeguarding lead to share them
When a family says their consent form is still correct for a new event, their
medical answers stay filed under the event they were first given for. The new
event's leaders cannot read them, because only the safeguarding lead (or a
master admin) can read the original. Until the lead presses "Share with this
event's leaders" on the event's Safeguarding page:
- the leaders see "Medical details held on their consent form" at check-in,
  not nothing
- the lead's page says how many families are waiting

Doing it without the lead would need a server.

### F-044 — a leader must have signed in to use the leader pages
Leaders are picked from the people who have signed in at least once, or from
the rota for that date. Someone on the rota who has never signed in can still
be named, and is shown as "has not signed in yet", but cannot open check-in or
see medical answers until they do.

### F-045 — what shows as a flag at check-in
From the consent forms, a flag is a written medical answer: a condition, an
allergy, a medicine, a need, unless it is "none" or similar. A yes or no is a
permission, not a warning. For example, the first-aid question (private because
of F-038) is kept private, but is not shown as a red flag at the door. The
collectors are any question that mentions "collect".

### F-046 — how long a DBS check and training count, per event (decided)
**Martin, 8 Oct 2026:** 3 years is the default, set on the Safeguarding settings
page. Each event can still change it. The original note follows.

Each event sets how many years a DBS check (from the date it was seen) and
training count. The default is 3 years each. A DBS certificate has no official
expiry, so this is EGBC's policy to set: **for Martin's safeguarding lead.** No
certificate number is ever stored: the rule has no field for one, and a test
proves it.

### F-047 — incidents and concerns are never deleted, and are not on the deletion list (decided)
**Martin, 8 Oct 2026:** kept, with no automatic deletion, until the safeguarding
lead sets a policy. That is how it is built. The original note follows.

Safeguarding records are usually kept far longer than consent forms, and the
period is EGBC's policy, not mine. So incidents and concerns have no "delete
after" date, the rules refuse to delete them, and the "due for deletion" list
does not show them. **For Martin's safeguarding lead to set.** The list also
does not email anyone monthly, because there is nothing here that can run on a
timer (F-015). It says "look at this once a month" instead.

### F-048 — how private a concern is (decided)
**Martin, 8 Oct 2026:** yes, a new safeguarding lead can read older concerns.
That is how it is built. The original note follows.

- Only the site's safeguarding lead and deputy can read it. Master admins
  cannot, and neither can the person who reported it.
- The lead is emailed that there is one; the email does not say what it is.
- If a site has no safeguarding lead set, a concern cannot be sent at all.
  The page says to speak to the church office or a minister that day, and
  that anyone in danger now needs 999.
- If the lead changes, the new lead reads the site's earlier concerns. That
  is probably right, but it is Martin's call.

### F-049 — under-8s are counted from the consent forms
A child's age comes from the date of birth on their consent form. A child
without a form yet is counted in the total but not as under 8, and the page
says how many ages are not known. Asking the age at sign-up (F-039) would close
that gap.

### F-050 — what stays admin-only
- **The roll-call** across all events: leaders see who is in on their own
  event's check-in.
- **Check-in settings.**
- **Downloading the incident log:** the safeguarding lead and master admins
  only. Leaders read and add to it, but cannot download it, and every download
  is logged.


## Safeguarding settings (after E3)

### F-051 — what the Safeguarding settings change, and what they leave alone
One page, `safeguarding-settings.html`, for admins and any safeguarding lead.
It holds:
- each form template's "answer lasts" and "kept after that"
- the default ratios
- how many years DBS and training count (3, F-046)
- whether every leader must have in-date checks

New forms made from a template, and events with no leaders set yet, take these.

"Also apply to the ones already made" counts first, then changes only:
- **forms made from a template** whose periods differ. A form built from
  scratch is left alone.
- **events coming up whose leaders are already set.**

A safeguarding lead who is not an admin changes only their own site's forms and
events, and the rules allow her nothing more on a form than its two periods.
**Answers already given keep their dates.** The rules refuse any change to an
answer, and a test proves it.

## E4: one-off upload links (NEXT-BRIEF §11)

### F-052 — the limit counts places taken, not photos received
Each upload takes a numbered place on the link before the file is sent, and the
rules refuse any file without a place. That is what lets the rules hold the
limit, which cannot count files. If a phone loses signal halfway through a
photo, that place is used up and the photo is not there. A link of 50 might
then take 49. Make the limit a little higher than you need.

### F-053 — rejected photos: Martin deletes them by hand
Code never deletes a photo; the rules refuse it, even for a master admin. A
rejected photo is not shown anywhere, but it is still stored. Under each
rejected photo, the Photos tab shows where it is kept, for example
`uploads/up_…/2`. To delete one:
1. Open the Firebase console for `egbc-worship-planner`.
2. Go to Storage, then the `uploads` folder, then the folder with that link's
   name.
3. Delete the file with that number.

The review record stays, marked rejected, so there is a trace of what was
removed.

### F-054 — the zip on the live site: closed, not needed
**Closed (8 Oct 2026).** The reviewing window tested the live storage bucket:
its download addresses already answer any site
(`Access-Control-Allow-Origin: *`), and the zip fetches each photo through its
download address, so it works as it is.

The command this finding first suggested has been removed, and must not be
used: setting the bucket's CORS replaces whatever is there now.

### F-055 — where Share to WhatsApp goes
Each link has "Copy link" and "QR code". Share to WhatsApp is the main window's
Step E. The spot is marked in `events-admin.html` (a comment beside Copy link),
ready for it.

### F-056 — iPhone (HEIC) photos are not drawn in the review queue
Most browsers cannot draw HEIC pictures, so those show as "HEIC photo: download
to see it". They are approved or rejected like any other, and the zip includes
them as they are.

### F-057 — "approved" means cleared for use; there is no gallery yet
Nothing on any page shows uploaded photos, approved or not. Approving one clears
it for the church to use: it goes in the zip, for the newsletter or the
website. A gallery on the event page would be a later step, and it would show
approved photos only.


## Chunk 4, stage R1: room profiles, "Hire our rooms", search by need

### F-058 — what R1 leaves for R2 and Chunk 5
- **"Free at that time"** and the **day and week grid** need bookings, which
  arrive in R2. Search by need in R1 finds the rooms that *fit*: how many
  people, which layout, which facilities, and never more than the
  fire-safety maximum.
- **"From £x per hour"** needs rate cards (Chunk 5). Until then the hire page
  says to ask about prices.
- **"Ask about hiring this room"** opened an email to office@esherchurch.org
  until `book.html` arrived. **Decided (Martin):** the address is right, but it
  must be a setting, not written into a page, because this will become a
  product for other churches. Done: **Church details** (`church-settings.html`,
  admins only) holds the church's name, enquiry email and logo, and every
  events page reads them from there. See F-063.
- **Menu prices** are stored now, for Chunk 5's quotes. Nothing is charged, and
  the public pages do not show them yet.

### F-059 — iPhone (HEIC) photos cannot be added to a room on most computers
Room photos are made smaller in the browser before they are stored (long edge
1600 pixels), and most browsers other than Safari cannot open a HEIC file. The
page refuses one and says to save it as a JPEG or PNG first, rather than storing
it at full size.

### F-060 — not built in R1 (Should items)
- **Room comparison** side by side.
- **The caterer's view** of upcoming orders: it needs catering orders, which
  come with booking requests (R2). It belongs with R2 or R3.

### F-061 — the old `photoUrl` field on rooms is not used
Chunk 1 gave each room an empty `photoUrl`. Room profiles keep a list of
photos instead, with the first one as the main picture. The old field is left
in place and unused, so nothing that might read it breaks.

### F-062 — "Hire our rooms" is a closed set of public pages (decided, built)
**Decided (Martin):** `hire.html`, `room.html` and `book.html` are a closed set
the church website links to. Someone arriving from the website sees only those
three: no hub Menu, no sign-in, nothing from the members' side, and no way into
it. Each has a plain header with the church's name and logo (from Church
details) and "Back to all rooms".

**Built:** the three pages load no hub shell and never look at who is signed
in. `r2-bookings.test.mjs` opens `hire.html` signed out, follows every link on
every page it reaches, and fails if any leads anywhere else (the one link
allowed out is the church's enquiry email, as a mailto).

**The links for the church website:**
- All rooms: `https://esherchurch.github.io/availability-form/v2/hire.html`
- One room: `https://esherchurch.github.io/availability-form/v2/room.html?id=<room id>`
- Ask to book one room: `https://esherchurch.github.io/availability-form/v2/book.html?room=<room id>`

A room's id is the last part of the address when its page is open from
`hire.html`. `room.html?r=<room id>` (the R1 address) still works.

The main window has put "Hire our rooms" in the hub Menu (a23cd7df). A member who
opens it from the hub is in the closed set too, so the way back to the hub is
the browser's Back button. **Decided (Martin), built in R3:** the header shows
"Back to the hub" only when someone is signed in. The public never see it: it
appears only once the browser says a person is signed in, and the pages never
ask anyone to sign in. The closed-set crawl (signed out) still passes, and
`r3-bookings.test.mjs` checks all three pages both ways.

**Still a REQUEST for the main window:** a way in for members from the hub
(the Menu) to `rooms.html` (Book a room) and, for admins and bookings admins,
`bookings-admin.html` (Room bookings). See F-067.

### F-063 — nothing about one church is written into the events pages
Searched every events page and shared file for the church's name, any email
address and the logo. What was written in, and what reads the setting now:

| Where | What was written in | Now |
|---|---|---|
| `room.html` | the enquiry address office@esherchurch.org | Church details' enquiry email |
| `hire.html` | "Esher Green Baptist Church" in the opening line | Church details' name |
| `hire.html`, `room.html` | the hub header's logo and name | their own header from Church details |
| `whatson.html` | church name in the subtitle and the calendar's name | the setting (calendar ids left alone, F-068) |
| `egbc-events.js` | the email footer | Church details' name (calendar ids left alone, F-068) |
| `places-admin.html` | the church's name as the seeded site's name and in examples | the setting, or "Main site" |
| every events email (events-admin, signup, forms, form, safeguarding) | the footer and reply address, by default | Church details, through `egbc-church.js` |
| the tab titles of 17 events pages | "— EGBC" | the church's name from the setting |
| `egbc-ics.js` (calendar files) | "Esher Green Baptist Church" in every file; a stand-in id at esherchurch.org for an entry given none | the setting's name; the site's own address (a stand-in id is new every time anyway) |

`egbc-ics.js` is not on my brief's list of files, but it was made for events
and only events pages use it (the rota feed has its own copy, untouched).

**Outside my pages (for the main window, F-067):** `egbc-email.js` still falls
back to office@esherchurch.org as the reply address and to "Esher Green Baptist
Church" as the footer when a page gives neither. Events pages always give both
now, so this matters only for other pages. `egbc-shell.js` draws the hub's
logo and "EGBC" name on members' pages; that is the hub's own branding and is
left alone.

## Chunk 4, stage R2: booking rooms

### F-064 — how a booking can never land on top of another
A room's day is 96 quarter-hours (`roomDays/<room>_<date>`, readable by anyone,
saying only which quarter-hours are taken, never by whom). A day nobody has
booked counts as the room's weekly pattern of rota services, set on the Places
page (Bookings tab). A confirmed booking marks its quarter-hours, including its
setup and pack-down, in the same write as the booking, and the rules check every
one was free, so neither a member nor the public can book over a confirmed
booking, a service or a buffer, whatever the page does. Two people booking the
same time at the same moment: the second is refused. Only the office (admins
and the site's bookings admins, set on Places, "Who approves") can book over
something, and the page makes them give a reason, which is kept on the booking.

### F-065 — what R2 leaves, and why
- **A service skipped one week still blocks the room.** The pattern is weekly;
  if Sunday worship moves for a week, the office books over it with a reason.
  Linking it to the live rota, week by week, is a later step.
- **Kit is a warning, not a rule.** The office page flags kit asked for twice at
  once (one PA, two bookings); the rules cannot add up quantities across
  bookings.
- **Members cannot cancel or move their own bookings yet.** They ask the office,
  who can. R3 adds a page for it.
- **Catering notice is a warning.** Too little notice for an item is shown on
  the form; the request still goes in.
- **Spam on book.html:** a hidden box robots fill in, and a minimum time on the
  page, stop simple robots. A determined one could still fill the office's
  list with requests (nothing is booked by them). If that happens, the next step
  is a check on the server (for example reCAPTCHA), which needs Martin.
- **Charges and quotes** wait for Chunk 5. Menu prices are shown on the form so
  people know; nothing is charged.
- **An event in a room** (events-admin) does not book the room yet; R3, with
  recurring bookings.

### F-066 — what the office is told
Every request that waits (a member's at a "wait for approval" room, and every
public one) emails the enquiry address in Church details. With no address set,
nobody is emailed and the request still waits on Room bookings.

### F-067 — REQUEST for the main window: hub entries and the style check
- **Menu:** "Book a room" → `rooms.html` (any signed-in member); "Room bookings"
  → `bookings-admin.html` (admins and bookings admins; the page itself turns
  anyone else away politely).
- **Style check:** please add `rooms.html`, `bookings-admin.html`, `book.html`
  and `church-settings.html` to `tests/check-style-every-screen.mjs`'s list.
- **`egbc-email.js`:** when a page gives no reply address or footer, fall back to
  Church details (or to nothing) rather than this church's address and name
  (F-063).

### F-068 — DECISION for Martin: the calendar ids of events still say esherchurch.org
Every event added to someone's diary carries an id, `egbc-event-<event>@esherchurch.org`.
A diary treats a new id as a new entry: change it, and anyone who added an
event before gets it twice. So it is left exactly as it was, as the main
window advised (FINDINGS-app A-021). It is the one place the church's
web address is still in the events code, and nobody sees it. Room bookings,
which are new, use an id with no church in it (`room-booking-<reference>`).
**Decided (Martin):** leave them as they are.

## Chunk 4, stage R3: repeating bookings, cancelling, emails, the setup sheet

### F-069 — how a repeating booking is kept
Every date is its own booking, carrying the series (its id, the rule, which
date of how many). So each date is checked, held, approved, moved and cancelled
exactly like a single booking, and the rules that stop double-booking apply to
every date unchanged. The rule is every week, every two weeks, or every month on
the same weekday (the second Tuesday); a month with no fifth Tuesday is
skipped. At most 52 dates, and 100 bookings in one go (rooms × dates).

**Per-date exceptions** are dates left out: a date that is not free is shown,
with why, and cannot be ticked; any other date can be unticked (a holiday
week). The dates left out are simply not booked; nothing records them as
"skipped", because nothing needs to.

**The clash report before approval** is the office's card for the series: a row
per date saying whether it is still free. "Approve every free date" approves
those in one go and leaves the rest waiting for the office to approve with a
reason, move, or decline one by one.

### F-070 — members cancelling their own: what the rules allow
A member can cancel their own booking, and change nothing else about it. A
confirmed one must give its time back in the same write, and the rules only let
a member take their own quarter-hours from 1 to 0. If the office booked
something over it (a 2 on the day), a member cannot free that time without
freeing the office's too, so the page says to ask the office, who can. Members
cannot un-cancel. **Hirers** (the public) still ask the office to cancel: the
brief's `my-booking.html` page, with a private link, belongs with charges in
Chunk 5.

### F-071 — where the office's emails go
Each site can have its own address for booking requests and cancellations
(Places, Bookings tab). Empty, they go to the church's enquiry email. The
address sits on the site's record, which anyone can read (the public pages read
sites), so the page says to use an office address, not a person's own. The
brief's "the site's bookings admins" are members in the address book, which the
public pages cannot read, which is why it is an address and not a list of
people.

### F-072 — what R3 leaves
- **Reminders**: decided (Martin) — later, a server step built by the main
  window. The spec is F-074.
- **Events in rooms**: decided (Martin) and built — F-075.
- **The caterer's own view** (mark prepared / served) is not built; the setup
  sheet has the kitchen's list for each day, which prints.
- **The setup sheet** is on the office's page. A caretaker who is not a bookings
  admin cannot open it; they get the printout. Say if a caretaker should have
  their own way in.
- **Changing a whole series** (a new time for every date) is one date at a time
  for now: the office moves each.

### F-073 — going back and forth between the rooms left a page on "Loading…" (found and fixed)
Found while running the R2 closed-set test, which failed now and then with the
room page still saying "Loading…". Measured on the emulator, 40 page loads
alternating between `hire.html` and a room, in one tab:

| | Pages that never drew (12 seconds) | Slowest that did |
|---|---|---|
| before, one tab | 17 of 40 | 9.7 s |
| before, a new tab each time | 0 of 40 | 0.15 s |
| after the fix, one tab | 0 of 40 | 0.46 s |

The test's network guard was not the cause (it stalled as often without it).
Each page's database connection lingered after the visitor moved on, including
in pages the browser keeps for the Back button, until the browser's few
connections to the database were used up. **Fixed** for the three public pages:
each closes its connection as the visitor leaves, and a page brought back by
Back loads afresh. `r3-bookings.test.mjs` goes back and forth twelve times and
fails if any page takes over 3 seconds; with the fix taken out it failed (7 of 12).

The live database connects differently from the emulator and may not show
this at all; it could not be tried there (no live testing). **For the main
window:** hub pages are just as able to pile up on the emulator when a test
moves one tab through many pages; if a page check ever hangs on "Loading…",
this is the likely reason, and the same two lines in `egbc-shell.js` would cover
every hub page.

## Back from the main window

### F-067 — done, and what the checks then found
`rooms.html`, `bookings-admin.html`, `book.html` and `church-settings.html` are
in `tests/group1-screens.mjs` now, with the screens each one has (the four tabs
on Room bookings, the day and week views on Book a room, the filled-in form on
`book.html`). The style check and the icon check both walk them.

**Style: all four clean**, 0 against DESIGN.md on every screen.

**Icons: two controls do not read as controls.** Neither is mine to change, so
they are here rather than fixed:

| Page | Control | Goes to | What the check says |
|---|---|---|---|
| `places-admin.html` | "Church details" (on all five tabs) | `church-settings.html` | reads as plain text — no icon, no border, nothing marking it out |
| `book.html` | "← Back to all rooms" | `hire.html` | the same |

The rule is the one A3 was held to: a thing you can click has to look like one,
by an icon or by being marked out from the words around it. An arrow glyph
inside the text is not enough on its own — that was the Sunday Service
Planner's SongSelect fault in a different place.

**The Menu entries are in**, as Martin approved them on 8 Oct: "Book a room"
(everyone, directly under "Hire our rooms") and "Room bookings" (under Core
Team → Events and rooms). Room bookings is **not** gated on `admin`: it is
visible to an admin *or* to anyone in a site's `bookingSettings.bookingsAdmins`,
who is usually on neither Core Team nor any admin list. The Menu opens the two
headings above it for that person and withholds everything else inside them,
including the Core Team charter the heading itself links to.
`check-menu.mjs` reads the Menu as that person and checks both halves.

**`egbc-email.js` no longer names this church.** The reply address and the
footer come from Church details. Nothing set means nothing said, and `replyTo`
is left off the payload rather than guessed — so if `sendEmail` ever required
that field, this is the thing to look at. I could not prove that end to end,
because nothing here sends. `tests/check-email-church-details.mjs` covers the
rest, 10/10.

### Worth knowing: a door is not a page
`EGBCAuth._blockPage()` now marks the body it replaces with
`data-egbc-blocked="<title>"`. Our two sweeps had been measuring that refusal
card as though it were the page behind it — and, the way round that matters,
scoring a clean 0 on pages they had never opened. If an events check walks
pages as one account, read that attribute before believing a result. The whole
story is A-023 in `FINDINGS-app.md`.

### F-074 — SPEC for the main window: reminder emails (Martin, F-072b)
Built later, as a server step (a scheduled function), by the main window. The
events pages already hold everything it needs; nothing here sends reminders.

**Who gets one**
- The person who booked each **confirmed room booking**: `bookings.requester.email`.
  That covers members (kind `member`) and hirers (kind `hire`).
- **Not** for: bookings that are waiting, declined or cancelled; an event's own
  booking (kind `event`: the event has its own people) or one the office made
  for itself (kind `office`); a booking with no email; any address ending
  `.invalid` (test data).
- Each date of a repeating booking is its own booking, so it gets its own
  reminder.

**When**
- Once, at **09:00 London time on the day before**: every confirmed booking whose
  `day` is tomorrow and which has no `reminderSentAt`.
- A booking made after that day's run (less than a day ahead) gets none: its
  confirmation has only just gone.
- After sending, write `reminderSentAt` (an ISO time) on the booking, so a re-run
  never sends twice. The server writes with its own access; the page rules need
  no change for that, but the events window should add `reminderSentAt` to the
  booking fields the rules allow when the server step lands.
- If the booking changes after the reminder (moved, cancelled), the move or
  cancellation email already tells them; no second reminder.

**What it says** (through egbc-email.js's function, with the Church details footer)
- Subject: `Reminder: <room>, tomorrow <start> to <end>`
- The room and site, with the site's address
- The time, and when the room is theirs if they asked for setting up and
  clearing away: "The room is yours from 18:30. Please be clear by 21:15."
- What it is for (`title`), how many, and the layout
- Refreshments and kit they asked for, if any
- The room's house rules (`rooms.houseRules`), for hirers
- The reference (as on every booking email)
- "Can't make it?": members, cancel in Book a room; hirers, reply to this email
- **Reply-to:** the site's bookings address (`sites.bookingsEmail`), or the
  church's enquiry email when the site has none

**Two smaller ones, if the server step can carry them (Should)**
- To each site's bookings address at 08:00: requests that have been waiting
  more than two days ("3 requests are waiting for you"). Nothing if none.
- To each site's bookings address at 07:00: that day's setup sheet (the same
  content as the Setup sheet tab). Off unless the site asks for it; a switch on
  the Places page, Bookings tab, is the events window's to add.

### F-075 — an event in a room books that room (Martin, F-072a: built)
Saving an event with a room on `events-admin.html` books the room for it, as a
booking of kind `event` linked to the event (`calEventId`).
- **The same rules as any booking.** The room's time, with "time to set up
  first" and "time to clear away after" (new on the event's room choice), is
  held on the room's day in the same write. The rules now refuse any booking the
  office makes over something unless it is marked as booked over, with a
  reason. Before this, the office could do that silently.
- **A room that is taken:** before anything is saved, the page says what is
  there ("Test band practice (18:00–19:00)", or the service), offers the rooms
  at the site that are free then, and, for admins, booking over it with a reason.
- **Moving the event moves the booking** (the same booking). **Cancelling** the
  event, setting its status to cancelled, or deleting a series gives the rooms
  back. Changing the room gives the old room back and books the new one.
- An event over several days books each day; all day is the whole day.
- A repeating event books every date; a date that is taken is reported before
  anything is saved.
- These bookings send no emails (the event has its own), and show on the
  calendars, the office page (as "event") and the setup sheet.
- **Not changed:** an event at an outside venue or online books nothing. Events
  saved before this change have no booking until they are next saved.

## Chunk 5, stage 1: prices, the instant quote, charges

### F-076 — how a hire is priced
- **Kinds of booking** (Places, Hire prices): each says whether it is for the
  public (on `book.html`) and whether it is charged. Church use is usually
  neither.
- **A room's prices for a kind** (`rateCards/<room>__<kind>`), typed in pounds
  and kept in whole pence: by the hour, half day (up to 4 hours), full day (up to
  10), evening (18:00 to 23:00), a minimum charge, cleaning, a technician by the
  hour, a deposit (part of the total) and a refundable damage deposit (on top);
  weekend and out-of-hours (before 08:00, after 22:00) surcharges, charity and
  regular-hirer discounts, as percentages; whether setting up and clearing away
  are charged; VAT. Room hire is whichever way of charging is cheapest for the
  times chosen. Kit has a hire price (Kit tab); catering uses the menu's prices.
- **The instant quote** on `book.html` shows every line as the hirer fills in
  the form, and for a repeating booking prices every date (a Saturday costs
  more) with the total for all of them. It is an estimate: it says so, and the
  office confirms the price.
- **The office** sees the same lines on each waiting hire request, worked out
  afresh from the price list, and can change any line, add one, take one away,
  or start again. Approving records the **charge** (`charges/ch_<booking>`):
  the lines, VAT, total, deposits, "unpaid", and whether it was adjusted. The
  booking keeps the price it was confirmed at, the hirer's email shows it, and
  "Coming up" shows what is owed. The rules refuse a charge whose total is not
  its lines plus VAT, or for a booking that is not at that site, and nobody but
  the site's office can read one.
- Prices are readable by anyone, because the public's quote is worked out from
  them in the browser.

### F-077 — what stage 1 leaves for stages 2 and 3
- **The hirer's own page** (`my-booking.html` with a private link): the quote as a
  document, accepting it and the terms online, paying. Stage 2.
- **Terms and conditions**, versioned per kind of booking. Stage 2.
- **Recording payments**, part-payments and refunds of deposits. Stage 2.
- **A repeating hire** is priced date by date from the price list and approved in
  one go; the office cannot yet change lines across a whole series at once (it
  can per date, before approving each). Monthly invoicing for regular hirers is
  stage 3.
- **"We are a registered charity"** is the hirer's say-so; the office sees a
  "check" mark and can take the discount line off. Hirer records (charity,
  regular) are stage 3, with insurance and risk-assessment uploads.
- **A member's booking** is never charged in stage 1; a member kind of booking
  that is charged would need the same form on `rooms.html`. Say if that is wanted.
- VAT is 20% when ticked; another rate would need a box on the price form.

### F-078 — members' rate and the VAT rate (Martin, F-077: built)
- **Members choose a kind of booking** in Book a room. Church and ministry kinds
  are free, and first (with none set up, "Church or ministry use" is offered).
  A kind marked "charged" is charged to members too.
- **Members' rate**, per charged kind (Places, Hire prices): none, a percentage
  off the room (and its surcharges), or a price list of its own (a second price
  card per room, "Prices for: Members"). A signed-in member gets it
  automatically and the quote says "Members' rate, 25% off the room" (or
  "Members' rate: room hire…" for the own price list). With none set, they see
  the standard price, and the quote says so. One discount at a time: the
  largest of members', charity and regular hirer.
- **The public never get it.** The office's page prices every booking the same
  way: the members' rate only for a member's own booking (kind "member", which
  only a signed-in member can make). The rules refuse a public request that
  claims it, or one that pretends to be a member's.
- **Decided here, say if not:** a member's booking of a charged kind waits for
  the office, like a hire, even at a room where members' bookings are confirmed
  straight away. The office confirms the price and records the charge; a member
  cannot. The rules hold this. Free kinds behave exactly as before.
- **VAT** stays off unless ticked; its rate is a box next to the tick (20 to
  start), per price card.

## Chunk 5, stage 2: the hirer's page, terms, payments

### F-079 — what stage 2 built
- **Terms by kind of booking** (Places, Hire prices): saving makes a new version
  (`terms/<kind>_v<n>`). The rules let nobody change or delete a version, so
  what a hirer accepted stays on record exactly as they saw it.
- **The hirer's own page**, `my-booking.html?k=<booking>`: the private link is in
  the approval email (one per date for a repeating booking). It shows the
  booking and its status; once confirmed, the quote as a document with the
  church's name and logo, and the terms; and "I accept" with their name. The
  rules let the link-holder accept once, on a confirmed booking with a price,
  only with the confirmed total and the current terms version, at the server's
  time, and change nothing else. "Print, or save as a PDF" prints the document
  alone. It belongs to no menu and has no sign-in, like the hire pages.
- **Payments recorded by hand** (Room bookings, Coming up): amount, how (bank
  transfer, cash, cheque, card on the day), date, reference; a refund the same
  way. The charge becomes part-paid or paid; the booking carries the same, so
  the hirer's page shows "Paid £50.00 of £70.00" or "Paid in full"; the payer
  gets a receipt. The office sees whether the quote was accepted.

### F-080 — what stage 2 leaves
- **A hirer cancelling** from their page (the brief's "cancel request"): not
  built; they reply to the email. Say if it is wanted, and whether it should
  cancel or only ask.
- **The damage deposit** is shown on the quote but not tracked separately as
  taken and returned; a refund can be recorded against the charge. The brief
  puts the refund workflow later.
- **The quote PDF** is the browser's own "save as PDF" from the print window,
  not a file the hub makes. Numbered invoices are stage 3, with the accounts
  export.
- **Changing a price after it is accepted**: the office can still record
  payments, but changing the charge lines after approval is not on the page.

## Chunk 5, stage 3: invoices, hirers, the damage deposit, the accounts export

### F-081 — asking to cancel (Martin, F-080: built)
"Ask to cancel" on `my-booking.html`, with an optional reason. It records the
ask (at the server's time) and tells the site's bookings address; it never
cancels anything, and the rules let it change nothing else. The office sees it
at the top of Waiting and either keeps the booking (a reason is required, and
goes in the email) or cancels it. If the hirer had paid, cancelling opens the
refund straight away, recorded as a payment the other way; a charge with
nothing paid is marked cancelled. After an answer the hirer may ask again.

### F-082 — what stage 3 built
- **Numbered invoices**: INV-00001 onwards, one counter for the church. The
  number is taken in the same write as the counter moves on by one; the rules
  hold both sides, so two people issuing at once cannot share or skip a number.
  An invoice's amounts never change after it is issued, and it is never
  deleted. A one-off hire is invoiced from its card ("Issue an invoice"); the
  email has the lines, the due date (pay within a set number of days), "how to
  pay" text and the hirer's page. When every charge on it is paid, the invoice
  is paid.
- **Monthly invoicing**: hirers marked "invoice monthly" get all their
  bookings in a month on one invoice (Room bookings, Invoices tab, choose the
  month). Their bookings have no single-invoice button.
- **Hirer records** (Hirers tab): name, organisation, email (how a booking is
  matched to them), phone, invoice address, charity (with number, and whether
  the office has checked it), regular hirer, monthly, notes, and documents
  (insurance, safeguarding policy, risk assessment, other) with expiry dates,
  stored in `hirerDocs/` for the site's office only. A document expired or
  expiring within 30 days is flagged on the record and on every booking of
  theirs. **The record decides the rate**: the charity rate only once the
  number is checked (the hirer's own tick no longer counts once there is a
  record), and the regular hirer rate; one discount, the largest.
- **The damage deposit**: recorded as taken (how, when), then returned in full
  or part, or kept, with the reason; the hirer is emailed and their page says
  where it stands.
- **The accounts export** (Accounts tab): CSV, Excel and JSON for a date range,
  a row per charge line, VAT, payment, refund and damage deposit move, each with
  an id that never changes (e.g. `ch_…#L0`, `#VAT`, `#P1`, `#DT`). Each row is
  marked when exported, so "only what is new" never sends a row twice.
- **The Calla Accounts seam** (`egbc-accounts.js`): admins choose None (the
  default) or Calla Accounts. With Calla on, hirers, invoices and payments are
  queued for it; nothing in the hub waits for it; the Accounts tab lists what
  has not been sent, with the reason, and "Try again".

### F-083 — DECISIONS for Martin (Calla Accounts)
- **The Calla connection itself is not built.** The brief says not to guess at
  Calla's API: it needs its own brief, written against Calla's code. Until then
  Calla mode queues everything with "not built yet", and the hub works exactly
  as in None mode.
- **Who numbers invoices in Calla mode:** decided (Martin): the hub keeps
  numbering, and Calla takes the hub's number. The Calla connection waits for
  its own brief.
- Bank details for "how to pay" are typed on the Accounts tab; nothing is
  assumed.

### F-084 — what stage 3 leaves
- **Expiry reminders by email** (a hirer's insurance running out) need the
  same timer as booking reminders. Added to the spec below (F-074 addendum).
  Until then the page flags them.
- **A hirer uploading their own documents** from their page: not built; the
  office uploads what the hirer sends. It would use the one-off upload links
  from E4.
- **Credit notes**: a cancelled booking that was invoiced keeps its invoice;
  the refund shows in the export. A formal credit note is not built.

### F-074 addendum — document expiry reminders (for the main window's server step)
- **Who:** the hirer (the email on their record) and the site's bookings
  address.
- **When:** 30 days before a document's expiry date, and on the day it expires;
  once each (mark `remindedAt` on the document in the hirer's record).
- **What:** "Your <insurance> runs out on <date>. Please send us the new one."
  To the office: the same, with the hirer's name and their next booking.

### F-085 — REQUEST for the main window: egbc-email.js's version tag
`egbc-email.js` changed (no default reply address or footer), but every page,
the events pages included, still loads it as `?v=202610062100`, so a browser
may keep the old copy. It is the main window's file, so the new tag is theirs
to choose; the events pages will follow it.

### F-086 — "Powered by Church HQ" (NEXT-BRIEF §19): done
The footer of `hire.html`, `room.html`, `book.html` and `my-booking.html` mounts
the main window's shared snippet (`EGBCPoweredBy.mount`). Plain text until the
snippet's link is switched on; the closed-set test already allows
churchhq.co.uk. Printing the quote hides it (never on PDFs). Screenshots:
`r3-poweredby-*-375.png`, `c5-poweredby-my-booking-375.png`.

### F-074 and its addendum — built, on the emulator, nothing deployed
The two timers are in the main window's `hub` codebase, with the rest of the
server side. `functions/reminders.js` holds the rules as plain functions of
their arguments — no Firestore, no clock, no network — so they can be read and
argued with; `functions/index.js` fetches, calls them and sends.

| Function | When |
|---|---|
| `bookingReminders` | 09:00 Europe/London |
| `documentExpiryReminders` | 09:30 Europe/London |

**`reminderSentAt` needs no rules change**, which is worth saying because
F-074 asked for one. The server writes with the Admin SDK, which does not go
through the rules at all; and `memberCancel`'s `affectedKeys().hasOnly([...])`
is on the **diff**, so a field already sitting on the document is invisible to
it. I checked `memberCancel`, `hirerAccepts` and `hirerAsksCancel` — all three
test what changed, not what is there. Nothing to do.

**Decisions the spec left open, and what I did:**
- **`remindedAt` on a document is a map, not a time**: `{ "30": iso, "0": iso }`.
  There are two moments and the second has to happen after the first; one
  timestamp would make the day-of reminder look already sent. A check seeds a
  document marked at 30 days and expects it still to be chased on the day.
- **A booking is marked `reminderSentAt` whether or not the send worked.** A
  failed send is in `emailOutbox` with its error; trying again tomorrow would
  be a reminder for a day that has already passed, which is worse than none.
- **09:30 for the expiry run**, so the two do not land together and a log is
  readable. The spec gave no time for it.
- **The two "Should" items are not built**: requests waiting more than two
  days, and the daily setup sheet. The second needs the per-site switch you
  said you would add on the Places page. Say when it is there and they are a
  small addition to the same file.

**Nothing is sent from the emulator.** Every message goes to `emailOutbox`
and no request is made — and every invented address ends `.invalid`, which
`sendableEmail()` refuses anyway. Two separate reasons nothing could reach
anybody. `emailOutbox` is also where the real sends are recorded, which is
what the deploy steps tell Martin to read on the morning it goes live.

`tests/check-reminders.mjs` — **38 checks**, 21 of them on the rules with no
database at all. Proved by three deliberate breaks: dropping the
already-sent guard made a second run send everything again; dropping the kind
filter reminded the event and office bookings; making `remindedAt` one flag
stopped the day-of chase after the 30-day one.

### F-085 — done
`egbc-email.js` is `?v=202610081729` on all 11 pages that load it.

## Chunk 6, stage 1 (K1): groups, children and households, registration

### F-087 — DECISIONS for Martin: where children's details live, and who sees them
- **Where.** The brief (§6.16) says people live in the address book or
  `contacts`. Children's details are kept apart instead, in `kidsFamilies` and
  `kidsChildren`: the address book can be read by anyone (the availability form
  needs that), and `contacts` by every signed-in member. A child's name, date of
  birth and allergy flags should not be either. They can be linked to a person
  id later (a CRM) without moving them. **Say if you want them in `contacts`
  anyway.**
- **Who.** "The children's team" for a site is: admins, the safeguarding lead
  and deputy, and everyone on the rota teams named on the register's Settings
  tab (e.g. Kids Church). All of them can see every child at that site,
  including the medical details. The narrower choice is that each group's
  leaders see only their group. **Say which you want**; the rules can do either.

### F-088 — what K1 built
- `kids-admin.html`, the children's register (Children, Registration, Groups,
  Settings).
- **Groups by school year**, each with its room, day, times and ratio (one
  leader to N children). Admins and the safeguarding lead set them.
- **Registration is the parent consent form (E2)**, set up once per site from
  the "parent" template, lasting the school year: each child's name, date of
  birth, school year, medical needs, allergies, photo and first-aid consent; the
  parent's phone, emergency contacts and who may collect. The children's team
  sends it and chases it; the rules let them use that form and no other.
- **A completed form becomes a family and its children** ("Add to the
  register"): each child goes into the group for their school year (worked out
  from the date of birth when the form leaves it blank; moved up each
  September); the parent is always one of the collectors; each family gets a
  six-character family code (stage 2's QR code and collection code). Allergy and
  medical are flags on the child; the detail stays in the form's private half,
  behind "Show medical details". Next year's form refreshes the same family and
  children, so nobody is on the register twice. A child moved to a group by hand
  stays there.
- Nothing is typed twice and there is no second form or second check-in.

### F-089 — REQUEST for the main window
- **Menu:** "Children's register" (`kids-admin.html`) for the children's team and
  admins, near Safeguarding.
- **Style check:** add `kids-admin.html`.
- **The personal dashboard (§6.16a)**, later: a parent's own children and their
  forms to complete. Stage 2 adds what the dashboard would link to.

### F-090 — what K1 leaves for K2 and K3
Family check-in and labels, check-out to a collector or the matching code, the
first-time visitor form at the door, the leader screen (K2); weekly and termly
registers, headcount per group, the visitor follow-up list (K3). Each group's
leaders on a Sunday come from the rota (K2), as E3 does for events.

### F-091 — for the main window: the setup sheet switch is there
Places, Bookings tab: "Email the day's setup sheet to that address each
morning", per site, saved as `sites.setupSheetEmail` (true or false; absent
means off). "That address" is the site's `bookingsEmail`, or the church's
enquiry email when the site has none. The sheet's content is on Room bookings,
Setup sheet tab (`drawSetup` in `bookings-admin.html`): confirmed bookings for
the day, by room, with setting up and clearing away, numbers and layout, sound
and projection, kit and where to fetch it, refreshments and the kitchen's list.

### F-087 — decided (Martin) and built: need to know
Children's records stay separate, open only to the people below, and can be
linked to the wider people records later.
- **The leads** see every child at the site, with medical details: master
  admins, the site's safeguarding lead and deputy, and the admins of the
  children's teams named on the register's Settings tab (an admin of Kids
  Church). "Site admins" is read as master admins: an admin of another team
  (Worship) sees no child. **Say if you meant every admin.**
- **A group's leaders** (named on the Groups tab, from the address book) see
  that group's children, with their medical details, and no one else's.
- **Everyone else** sees nothing, including people on Kids Church who lead no
  group.

How the rules hold it:
- **Each child has their own medical copy** (`kidsMedical`), carrying the
  child's group. The family's form covers all its children, so a pointer to it
  on Ada's record would have let a Little ones leader read her Junior
  brother's details. The pointer is gone, and the rules refuse to put one back.
- **The family record** (which names the forms) is the leads' alone. What a
  group leader needs (parent's phone, emergency contacts, collectors, family
  code) is copied onto each child.
- **A child who changes group takes their medical copy with them** in the same
  write; the rules refuse one without the other. Afterwards the new group's
  leaders can read it and the old group's cannot.
- Only the leads send the registration form, add families, set groups and
  move children. The leads themselves are set by a master admin or the
  safeguarding lead.

One thing to know: an admin of Kids Church is an "admin" in the hub's general
sense too, so the older forms rules (E2) already let them send any form and
read every form's answers at the site. That was true before Chunk 6.
### F-089 — done, with one change to where it sits
**"Children's register" is in the Menu**, and `kids-admin.html` is in the
style check (`tests/group1-screens.mjs`). It measures **0** against DESIGN.md
and its console is clean.

**It is NOT under Core Team → Events and rooms.** F-089 said "near
Safeguarding" and F-031 had pencilled Safeguarding in there. I have put it
under a **Kids Church** heading instead, beside Worship & AV and Youth:

- Events and rooms is about rooms and events. A register of children is
  neither.
- **The children's team are not on Core Team.** They would reach their own
  register through a heading called Core Team and then one called Events and
  rooms — neither about their work, neither saying what they are looking for.
  That is the complaint Step N exists to answer.
- Room bookings already had to be bent into that shape, sitting under those
  two headings while not being gated on Core Team so that its people get
  through. Once is a workaround; twice is the wrong structure.

**So Safeguarding and Check-in should go under Kids Church too** when you ship
them, not under Events and rooms. That is a change to F-031's plan — say if
you disagree and I will move it.

**Who sees it:** somebody on Kids Church, the person who administers Kids
Church, or a master admin. Deliberately **not** every admin — whoever looks
after Worship is not the children's team. `check-menu.mjs` reads the Menu as a
Kids Church leader and as Karen (administers it, not on its rota); both get
it, a Worship member and a bookings admin do not.

**F-087's rules work is not mine** — children's records, group-level medical
access, the safeguarding lead. That was in the same message and I have left it
alone; it reads as yours.

### F-092 — F-087 forms decided (Martin) and built: each team its own forms

**What the rules now say.** Every form has a team (a new `team` field on
`forms`). A team's admins may build, send, chase and read that team's forms
only. Master admins and each site's safeguarding lead and deputy see all
forms. A form with no team belongs to master admins and the safeguarding lead.
The medical halves (`sensitiveResponses`) keep their E3 rule, unchanged.
Tests: "whose forms" in firestore-rules.test.mjs; the deliberate break (any
admin counts as the form's team) failed five checks, including "A KIDS CHURCH
ADMIN CANNOT READ A WORSHIP LEADER'S DECLARATION".

**This changes access on live data once Martin deploys the rules.** The forms
already on the live site have no team. After the deploy, only master admins
and the safeguarding lead can use them, until a master admin opens each form
on Forms and picks its team. Worth doing straight after the deploy. Nothing is
lost or deleted; it is only who can see.

**Pages changed:** Forms (a Team choice on each form; each person's lists ask
only for the forms they may see), Safeguarding settings (the list of every
form is for master admins only), the check-in page (a team admin finds an
event's answers through the forms asked for at that event), and the
children's register (its registration form belongs to the children's team).

**Events:** a form for an event is the form's team's, not the event's. An
event leader still sees the requests for their own event, as before.

### F-093 — what K2 built (Chunk 6, stage 2: Sunday check-in)
- **A new page, `kids-checkin.html` ("Sunday check-in")**, linked from the
  Children's register. Three tabs: Desk, First time here, Groups.
- **It is E1's check-in, not a second one.** Each child is one record in
  `checkins`, in a session for their group and the day
  (`kids_<group>_<date>`), with the same "worked out, never random" id, so two
  tablets cannot check a child in twice.
- **The desk** (the children's leads): find a family by a name, any part of
  the parent's phone, or the family code (typed, from a hand scanner, or read
  by the camera from the parent's slip). Tick who is here, press Check in.
- **Labels**: one per child with name, group, date, "ALLERGY: ask a leader"
  when there is one (never the detail), and the family's collection code.
  The parent's slip has the same code and the family QR code for next week.
  They can be printed or shown on the screen.
- **Check-out**, as the rules insist: only to someone on the child's list
  (picked from the list on their record), or to anyone who gives the code. A
  wrong code is refused, with "find a lead, and ring the parent".
- **First time here**: one form at the door with each child's name, school
  year and allergies; the parent's name and mobile; consent; and first aid.
  It registers the family as visitors (consent for today only), puts each
  child in the group for their year, checks them in and gives the labels. If
  an email address is given, the full registration form (E2) is emailed to
  fill in at home.
- **The leader screen**, per group: who is in, not here yet and gone home,
  live; the count and the leaders needed at the group's ratio; each child's
  allergy and medical flags, with the details, the parent's number on tap
  and "Page a parent" (the number shown large, with a Call button; a text
  message comes later). A leader can check their own group's children in and
  out at the door.
- **The Children's register**: a lead can now change who may collect. It
  applies to the whole family.
- **The fire roll-call** (`checkin.html?view=rollcall`) now asks for event
  check-ins by kind, and adds Sunday children for the people who may see
  them (see F-094 c).
- Tests: rules ("Sunday check-in", 29 checks), k2-sunday-unit (21),
  k2-sunday in the browser (38).

### F-094 — DECISIONS for Martin (K2)
a. **No way round it at the door.** A child goes home only with someone on
   their list or with the code. If a parent rings to say someone new is
   coming, a lead adds that person on the Children's register first; a group
   leader cannot. Is that right, or should a lead be able to let a child go
   with a written reason, as events do (E1)?
b. **Consent out of date.** The desk shows "Consent ran out" in red but
   still lets the child in. Should it stop them instead?
c. **The fire roll-call.** Children are now in it only for master admins,
   the safeguarding lead and deputy, and the children's team admins (need to
   know). Other admins see event check-ins only. In a fire, should whoever
   holds the roll-call see the children's names too? If so, who?
d. **Parents checking in on their own phone.** Built: the parent shows the
   family QR (on their phone or last week's slip) and the desk scans it.
   Not built: parents ticking their own children in. That would need the
   children's names to open to anyone holding the code. Say if it is wanted.
e. **Group leaders on a Sunday** come from each group's leader list (K1),
   not yet from the rota. Copying that Sunday's rota people in, as E3 does
   for events, could come in K3. Say if it is needed.
f. **Visitors** have consent for that day only. The next week they show
   "Consent ran out" until the full form comes back.

### F-095 — REQUEST for the main window
- **Menu:** "Sunday check-in" (`kids-checkin.html`), next to "Children's
  register", for the children's team and admins.
- **Style check:** add `kids-checkin.html`.
- **For Martin, on deploying the rules:** the Sunday lists ask by group and
  day, by site and day, and by day and kind. If the live database asks for an
  index the first time, its error message includes a link that creates it.
  Indexes are Martin's to deploy.

### F-096 — an existing page changed: the fire roll-call
`checkin.html` is E1's page, so it's mine, but it is already live. Its roll-call
asked for "every check-in today". The rules now refuse that question, because
children's check-ins are in the same place and other admins may not see them.
So it now asks for event check-ins by kind, and adds children for the people
allowed to see them. What admins see for events is unchanged. The E1 tests
still pass.

### F-094 — decided (Martin) and built
- **No override at the door:** kept as built.
- **Expired consent:** the red warning stays and the child comes in. The
  desk now has "Show the renewal QR code": the parent scans it and fills in
  the registration form on their phone. If we have their email, the same
  link is sent there too.
- **The fire roll-call, during a session:** everyone leading that morning
  sees every child checked in, with name, group and time in only. That means
  the group leaders, the rota's Session Leader and the leads. The rules
  enforce it, through a roll-call copy (`kidsRoll`) that holds nothing else.
  See F-097.
- **The rota's Session Leader** sees every group that morning, and the
  medical details of the children checked in that morning only. They see
  nothing once the morning closes, and never a child's record or phone
  numbers. Group leaders stay named on the Groups tab.
- **Parents checking in on their phone:** later.

### F-097 — what K3 built (Chunk 6, stage 3: the rest of Sunday kids)
- **The morning.** A lead opening Sunday check-in on a day a group meets
  opens the morning (`kidsMornings`, one per site per day). It names every
  group leader meeting that day, and the rota's Session Leader, whom the rules
  check against the rota for that date. It closes by itself at the end of the
  day (never more than 18 hours). The desk shows who the Session Leader is.
- **Roll-call tab:** who is in now, by group, with name and time in, and a
  print button. The leads and the Session Leader can tap a name for that
  child's medical details. Group leaders can't. Outside a morning, a group
  leader sees only their own group.
- **Leader screen extra:** "Allergies and medical needs in the room now", the
  list for snack time, covering only the children who are in.
- **Registers tab:** by group, for the latest week, this term, last term or
  chosen dates. It shows a tick per child per week, the weeks each child came
  and the number of children each week. It downloads as CSV for Excel, and the
  download is logged. Leads see every group; a group leader sees their own.
  Terms are counted as Sept–Dec, Jan–Mar and Apr–Aug; any dates can be chosen.
- **Visitors tab (leads):** new families this week or in the last four weeks,
  with their children and groups, phone and email, and whether the full form
  is back. It has "We have said hello" (who and when is noted) and "Send the
  form again".
- **Not set up yet** (from your message), on the Children's register and on
  Sunday check-in:
  - **No site in Places:** admins see the two steps with links (Places, then
    the register's Settings to choose the children's team). Everyone else
    sees "ask the church office".
  - **A site but no team chosen:** a master admin or the safeguarding lead
    goes straight to Settings. On the live site today, that is what a master
    admin will see.
- Tests: rules ("the morning", 21 checks); k3-kids-unit (11);
  k3-morning in the browser (30).

### F-098 — DECISIONS for Martin (K3)
a. **The morning opens when a lead opens the desk** on a day a group meets.
   If no lead opens Sunday check-in that morning, the group leaders and the
   Session Leader see only their own group (the Session Leader sees nothing).
   Is a lead always at the desk, or should the Session Leader be able to open
   the morning too? The rules could allow it, since they already check the rota.
b. **Only one Session Leader** per morning, as the rota has one slot. Say if
   there can be two.
c. **Terms** are counted as Sept–Dec, Jan–Mar and Apr–Aug. If you want the
   real school term dates, they could be a setting.
d. **"Page a parent"** still shows the number to call. A text message needs
   an SMS service, which would be its own brief.

### F-099 — for the main window
- **Style check:** add `kids-checkin.html` (as F-095), now with its Roll-call,
  Registers and Visitors tabs.
- **For Martin, on deploying the rules:** two new collections, `kidsMornings`
  and `kidsRoll`. Their lists ask by site and day, or by group and day, so no
  new index should be needed.

### F-098 — decided (Martin) and built
- **The rota's Session Leader may open the morning**, if no lead has yet.
  They can name only themselves, only for today, and the rules check the
  rota for that date. Tests: rules ("THE ROTA'S SESSION LEADER OPENS THE
  MORNING THEMSELVES"), browser (f098-screen).
- **Term dates are a setting** on the Children's register, Settings tab:
  three terms, each with a name, start and end, set by a lead each year
  (`kidsTerms/<site>`). The rules refuse terms that overlap or end before they
  start. The registers use them; in a holiday, "this term" is the term just
  gone. Until they are set, the registers guess as before.
- **SMS paging:** later. Instead, parents are paged on the screen through
  ChurchShow: a "Show on screen" button next to "Page a parent". The
  contract is F-100.

### F-100 — THE CONTRACT: paging a parent on the screen (ChurchShow reads this)
**Collection:** `screenPages`. One document per page. Its id is the child's
check-in id, so paging the same child again replaces the last page.

**Fields: exactly these, nothing else (the rules refuse anything more):**

| field | type | what it holds |
|---|---|---|
| `siteId` | string | the site (Places) whose screen shows it |
| `code` | string | the family's collection code for that morning, 4 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0, O, 1, I or L) |
| `room` | string | the group's room name (or the group's name if it has no room), up to 80 characters |
| `message` | string | exactly `"<code>, please come to <group>"`, e.g. `"K7P2, please come to Little ones"`. The rules check it letter for letter against the code and the group's name |
| `createdBy` | string | the uid of the leader who paged |
| `createdAt` | timestamp | server time |
| `clearedAt` | timestamp or null | `null` while it is on the screen; server time once cleared |

**Never a child's name.** The rules allow only the code and the group's name in
the message, and nothing outside these seven fields.

**How ChurchShow reads it.** As **the paired ChurchShow device** for that site
(ChurchShow pairing, request R6). Never give a volunteer's account to the
projection PC. It listens to:

    screenPages where siteId == <the site> and clearedAt == null

Show each page whose `createdAt` is less than **5 minutes** ago. Treat anything
older as cleared, even if `clearedAt` is still null. A list that doesn't ask
for `clearedAt == null` is refused.

**Who writes:**
- Group leaders, that morning's Session Leader and the leads create a page,
  for a child who is checked in.
- They clear it with "Done" (only `clearedAt` changes, to server time).
- The leader's screen also clears it itself once it is 5 minutes old.
- Nothing is ever deleted.

**Tests:** in the rules ("THE CONTRACT: the projection computer … exactly these
fields, a code and no name"), and in the browser (f098-screen: "THE CONTRACT: one
document, exactly …", "THE CODE ONLY, NEVER THE CHILD'S NAME", "the projection
computer … reads it as ChurchShow will").

**For the ChurchShow window:** the reader isn't built here. Building it there,
against this contract, is theirs.

### F-101 — the Session Leader can page, but has no button
The rules let the Session Leader page for any group that morning. But their
screen is the roll-call, which holds no collection codes, so it has no "Show
on screen" button. A group leader or a lead pages from the group screen. Say
if the Session Leader needs the button: they would need to see the codes.

### F-102 — what Chunk 7 stage 1 built (small groups: directory, find a group, joining, membership)
- **`groups.html`, "Find a group"** (public, like What's on, with the Powered by
  Church HQ footer).
  - Everyone sees the public groups that are running; signed-in members see
    members-only groups too.
  - Filters: words, day, kind, area, and "taking new members".
  - Each group shows when, roughly where, who it is for, who leads it and
    whether it is open. "Roughly where" is a room, a venue, "online", or for a
    home group only its area ("In a home in Esher"). There's a picture if one
    was uploaded.
  - **"Ask to join"**: name, email, phone, a message. A member asks as
    themselves. A visitor becomes a contact in the same write (one place for
    people, §6.16).
  - The asker is emailed a copy. When the asker is a signed-in member, the
    leaders are emailed too (see F-104).
  - **"Your groups"** for members, with the address or meeting link of
    their own groups.
  - A link such as `groups.html?group=<id>` opens one group, for sharing.
- **`groups-admin.html`, "Small groups"**:
  - **Groups:** groups admins add groups and choose leaders. Leaders edit
    their own group's details, but not its leaders or whether it is public.
    Home groups have an area (public) and an address (private). Online
    groups have a link (private). There's a members-only switch, an under-18s
    flag, "running" and a picture.
  - **Members:** add from the address book, remove.
  - **Requests:** accept (welcome email with when and where, and the address
    now they are in) or decline (a kind email).
  - **Settings:** a master admin names which team's admins are the groups
    admins. Until then, admins see "Not set up yet".
- **Rules:**
  - The address and the link live only in `smallGroupPrivate`: the group's
    members, its leaders and the groups admins. The rules refuse an address
    on the public card.
  - Who is in a group is visible to the group, its leaders and the admins,
    and each person sees their own places.
  - The member count moves with each member added or removed, in the same
    write, and never past the group's limit. Nobody can ask to join a full
    or closed group.
  - Nothing is deleted.
- Tests: rules (small groups, 39 checks); storage (group pictures, 4);
  c7-groups-unit (18); c7-groups in the browser (32).

### F-103 — members on no team are "pending", so they join as visitors
In this hub, a member on no rota team signs in as **pending**, not active (the
main window's sign-in, `egbc-auth.js`). Small groups follows the rules
already there: a pending member sees only public groups, and asking to join
makes them a contact, like a visitor. Many people in small groups will be on
no team. **For Martin:** should anyone in the address book count as an active
member for small groups (and What's on), whether or not they are on a team?
That's a change to the main window's sign-in, not mine.

### F-104 — leaders aren't emailed when a visitor asks
Correction: the address book *is* readable by anyone today (the main window's
proposal of 9 October is to close that). So Find a group deliberately doesn't
read it for a visitor: that would break the day it closes. A signed-in member's page can, and does. Visitors' requests wait on
Small groups, Requests (with a count on the tab). **For the main window:** a
server step to email the leaders about new requests, and a "requests waiting"
badge in the hub for group leaders.

### F-105 — REQUESTS for the main window (small groups)
- **Menu:** "Find a group" (`groups.html`), for everyone, near What's on.
  "Small groups" (`groups-admin.html`), for groups admins and group leaders.
- **The personal dashboard (§6.16a):** "Your groups", using
  `smallGroupMembers where personKind == 'addressBook' and personId == <member id>`.
  The rules allow exactly that list.
- **Contacts:** please add `'group'` to the sources a public contact may have
  (`publicContact()`, outside my section). A visitor asking to join is saved
  with source `'signup'` until then.
- **Style check:** add `groups.html` and `groups-admin.html`.

### F-106 — left for stage 2 of Chunk 7
Meetings and attendance, messaging the group, notes per meeting, group
events, leader oversight; members leaving a group themselves; leaders
uploading the picture (only groups admins can, for now); and connecting
under-18s groups' leaders to the checks and forms (§6.10). The flag is there
and is shown.

### F-103 — decided (Martin, NEXT-BRIEF §21)
Anyone in the address book is an **Attender**, not a visitor. The office
ticks some Attenders as **Church members**. Small groups needs no change for
this: once the main window makes Attenders `active`, they see members-only
groups and ask to join as themselves.

**Next, once the main window adds `isAttender()` and `isChurchMember()`:**
every event, form and small group gets "Who can come": Everyone (public),
Attenders, Church members only, or a team. The rules will enforce it, and
members-only items stay hidden from those who can't come. This waits for the
main window and is not built yet.

### F-107 — what Chunk 7 stage 2 built (small groups: meetings, register, messages, oversight)
- **Meetings** (Small groups, Meetings tab):
  - each group's meetings by date, with the next one on the group's day
    marked "Next", and another date can be added
  - **notes or a study plan** per meeting, which the group's members see
  - "Not meeting this time"
- **The register:** a tick per member and a guests count, made for a phone.
  Only the leaders and the groups admins see who came. The rules refuse it
  to the members.
- **Download who came** for chosen dates: CSV with a column per meeting,
  times per person, guests and totals. Each download is logged in the
  leader's name.
- **Message the group:** one email to each member, so addresses stay private
  from each other. The reply goes to the leader. Messages are kept, and the
  group's members read them again on "Find a group".
- **Members leave themselves:** "Leave this group" on "Find a group". Their
  place and the count go in one write, and the rules allow only their own
  place.
- **Leaders put up their group's picture** (storage rule: the group's own
  leaders, or the groups admins).
- **Under-18s groups (§6.10):**
  - Each leader's DBS check and safeguarding training are shown from the
    same records E3 uses (status and dates only), with "not cleared yet"
    when one is missing or out of date.
  - A master admin can record a check there.
  - There is a pointer to send the leader declaration from Forms.
- **Oversight** (groups admins): every group with its members, leaders, when
  it last met, how many usually come (the last 8 registers) and whether
  that's growing, steady or smaller; and the **people in no group**.
- Tests: rules (stage 2, 19 checks); storage (leaders' pictures, 2);
  c7-groups-unit (27); c7-stage2 in the browser (22).

### F-108 — my rules that use "active", for the Attender change (§21)
§21 makes `active` true for every Attender. Every `active()` in the events
section, and what it will mean:
- **Fine for Attenders, as intended:**
  - small groups: members-only groups, asking to join as themselves,
    leaving, "Your groups"
  - raising a safeguarding concern
  - logging one's own downloads
  - Sunday check-in's screen pages (codes only)
  - reading the term dates, the kids groups' names and the kids settings
  - reading `eventLeaders` (who leads an event)
  - reading the safeguarding settings (policy numbers)
  - the catering menus
  - an event leader's own rights
  - booking as a member
- **Bound to something stronger already:**
  - the invoice counter moves only with an invoice the office writes
  - forms by team need `adminFor`
  - kids leads and group leaders need their lists
  - the morning needs its lists or the rota
- **Worth a look:** `settings/accounts` (the accounts connector mode) is
  readable by any active person. It holds no secret today (the mode and an
  export mark), but once Attenders are active it may be better as office
  only. I'll make that change if Martin agrees.

### F-109 — under-18s groups: checks are shown, not enforced
As on events (E3), an under-18s group's leaders' checks are shown with a
warning. Nothing stops an uncleared leader being named. A master admin
records the check here. A safeguarding lead records it on an event's
Safeguarding page, because groups have no site of their own. **For Martin:**
should naming an uncleared leader to an under-18s group be refused outright?

### F-110 — two guards that back each other up (from the stage 2 breaks)
A member taking someone else out of a group needs two rules to fail. One
lets a member delete only their own place; the other lets a member change
the count only for their own place. Breaking either alone was **not**
caught, because the other still refused. Breaking both together was caught
("a member cannot take someone else out"). Kept as two guards on purpose.

### F-111 — R6 (ChurchShow): the paired device reads screenPages; waiting on the main window
ChurchShow reads as a **paired device** (`churchshow-<site>`, claim `device: 'churchshow'`,
no `users/` record), so the current rule (any signed-in active person) would
refuse it. When the main window has added the `churchShow()` helper (ChurchShow
pairing, R1 to R5), I add this ahead of the existing read conditions, exactly as R6 asks:

    allow read: if (churchShow() && resource.data.siteId == request.auth.token.siteId && resource.data.clearedAt == null)
                || ...the rest as now

**The five tests are written** (rules tests, "R6"): its own site's uncleared
pages allowed; another site's page, a cleared page, a list without
`clearedAt == null`, and any write all refused. Until the helper exists they
are skipped, and the rules run prints a note saying so. I haven't defined the
helper myself: it belongs outside the events section. F-100 now says "the
paired ChurchShow device".

### F-112 — Martin's safeguarding defaults (9 October 2026), built
- **Consent and permissions last one year, 12 months from when they're
  given, for every form template**: parent consent, trips, leader
  declaration, hirer safeguarding, health and access. There's a new period,
  "a number of months", on Forms and in Safeguarding settings, defaulting to
  12.
- **The leader ratio default is 1 to 5.** The under-8s default stays 1 to 4.
  The same goes for a new children's group on the register.
- **Defaults only:** forms already made keep their period, and answers
  already given keep their dates. If the office has saved its own periods
  in Safeguarding settings, those still win.
- The children's register now says "once a year" and "lasts a year from when
  it is given".
- Tests updated to the new defaults (e2-forms-unit adds three checks; the e2,
  e3-settings and k1 browser tests check a year from today).

### F-109 — decided (Martin) and built: under-18s groups refuse an uncleared leader
- **The rules refuse** naming a leader to an under-18s group unless they
  have an **in-date DBS check and safeguarding training** (`leaderChecks`,
  judged against the years in Safeguarding settings, 3 if unset), or a
  **master admin or the safeguarding lead has recorded an exception** with a
  reason (`smallGroupExceptions/<group>__<member>`, at least a sentence).
  An exception is for that group only.
- **When it's checked:** every leader when a group is made, or first marked
  under-18s (at most three leaders at that moment); then the one leader
  added on each later change. The page saves an under-18s group's new
  leaders one at a time for this.
- **The page:** a refused save says who isn't cleared. A master admin or the
  safeguarding lead gets "Record an exception for …"; after that, saving
  again names the leader. The group's checks panel shows the exception and
  its reason.
- **Not re-checked later:** a leader whose check runs out stays named. The
  panel shows them as "not cleared", as before.
- Tests: rules (12 checks); c7-stage2 in the browser adds three steps.

### F-108 — decided (Martin) and built: the accounts setting is the office's
`settings/accounts` (the accounts connector mode, and "how to pay" on
invoices) is readable only by admins and the bookings admins of the sites it
names. An admin saving it on Room bookings, Accounts fills in those sites.
**The setting already saved live has no site list yet,** so until an admin
saves it once, only admins can read it. A bookings admin who isn't an admin
then prints invoices without the "how to pay" text. **For Martin:** after
deploying the rules, open Room bookings, Accounts, and press Save once.

### F-113 — phone notifications: step F is in FINDINGS-notify.md
Notifications move to the events window (SHARE-NOTIFY-BRIEF, steps F then K).
Step F, establishing only, is written up in `FINDINGS-notify.md`:
- what's there (N-0)
- **Martin's Firebase console steps in plain words (N-1)**
- the plan for "call a parent" (N-2)
- the requests for the main window (N-4, N-5)
- three decisions for Martin (N-6)

Nothing is built yet.

### F-114 — "Who can come" built (Martin, NEXT-BRIEF §21)
Events, forms and small groups each have **"Who can come"**, with four
choices: **Everyone** (public), **Attenders** (signed in from the address
book), **Church members only**, or **one or more teams**.
- **Events:**
  - The choice is on the event form.
  - The rules judge the event's `audience` list, as before; "Church members
    only" is the new value `churchMembers`.
  - A rule in my section lets Church members read those events. The main
    rule (outside my section) still lets admins read every event.
  - **Hidden, not locked:** What's on asks only for what each person may
    come to (Church-members-only events only for Church members and admins),
    so an Attender never sees it at all.
  - Opening its link says only "That event could not be found, or it is not
    open to you", the same as a missing event, now also when the rules
    refuse it.
- **Small groups:**
  - "Who can come" replaces the old "members only" tick, stored as `canCome`.
    A group's existing `audience` field is the words "who it is for", so it
    keeps its name.
  - The rules refuse a `canCome` that doesn't match the setting.
  - Find a group asks only for groups the person may come to.
  - A group's leaders and its own members always see it.
  - Nobody can ask to join a group they can't come to.
- **Forms:**
  - "Who can fill it in": anyone with the link (as before, the default),
    Attenders, Church members only, or its team.
  - The rules refuse an answer from someone it isn't for.
  - The form page says so before anything is typed: "Sign in to fill it in",
    or "You are signed in as someone it is not for".
- Tests:
  - rules ("Who can come": 28 checks, of which 3 sign-up checks wait for
    F-115)
  - who-can-come in the browser (15)
  - group test data updated with `canCome`

### F-115 — REQUEST for the main window: sign-ups must check "Who can come"
The sign-up rule (`match /signups/{manageKey}`, outside my section) doesn't
check who an event is for. Today anyone with an event's id, signed in or
not, can sign up to it, Church-members-only events included. **One line,
please:**

    allow create: if signupShape() && takesItsPlaces() && canSignUpTo(request.resource.data.calEventId);

`canSignUpTo()` is in my section, and checks the same audiences as reading.
**Tested here on a copy:**
- with the line, all 704 rules checks pass, including "SIGN-UP: AN ATTENDER
  CANNOT SIGN UP TO A CHURCH-MEMBERS-ONLY EVENT"
- without it, that check fails

The three sign-up checks are in the rules tests already. They're skipped,
with a note, until the line is there, then they run. Please also run the
events browser tests (e1, signups) after adding it.

### F-116 — noted: the main window changed the screenPages read rule
Adding R6, the main window changed "anyone signed in reads an uncleared page"
to "volunteer()" (anyone on a team, or an admin). Now that every Attender
signs in as active, that's the right call: collection codes stay with
volunteers, the leads and ChurchShow. I've left it as they wrote it. R6 runs
and passes (5 checks, none skipped).

### F-117 — what "Attenders" means in the rules
The Attenders choice is the existing "members" audience. The rules judge it
with `active()`, and since §21 that includes every Attender as well as every
volunteer. I didn't switch it to `isAttender()`, because the event rule
that judges it is outside my section. The difference: `isAttender()` would
leave out a volunteer who isn't marked as an Attender. **For the main
window, if wanted:** use `isAttender() || volunteer()` there.

### F-118 — for the main window: addressbook.html now times out in the page check
The events window's page check ("pages-smoke") loads every v2 page against
my emulators. Since commit 79e5bf8e ("Shut the address book…"),
`addressbook.html` doesn't finish loading within 20 seconds, joining the
five that already timed out (MonitorStageMap, Planner,
SundayServicePlanner, view-only-rota, youthserviceplanner). It's not my
page and I haven't changed it. It may simply be waiting for sign-in, as the
others do. Worth a look.

---

## THE PHONE APP: the events window's part, established (APP-DESIGN-BRIEF §6, §8; NEXT-BRIEF §22)

Read 9 October 2026, with the agreed mock-up (`design/app-mockup.html`)
opened at phone size as Sarah, Karen and Jo. **Nothing is built yet.** This
covers what each of my screens needs, what already exists, what's missing,
and what I need from the main window.

### F-119 — how my screens fit the app (needs agreeing with the main window first)
The main window builds the shell: spaces, the pill row, bottom tabs, Home,
Me and Running things. My screens sit **inside** it. I propose:
- each of my screens is its **own v2 page** with a compact phone layout
  (`?app=1`: no page header, no Menu; the shell gives those)
- the shell opens it in the tab's place
- the shell passes the space colour, and my page uses it for highlights

That keeps each feature in one page: the full page on a computer, the same
page in the app (§5 "don't double up"). The other way would be a JS module
per screen that the shell draws into its own page. **Request A1:** the main
window chooses one, and tells me the size of the bottom bar and the safe
areas the page must leave clear (§7: `viewport-fit=cover`,
`env(safe-area-inset-bottom)`, 48px targets).

### F-120 — Kids Church space: "Today" and "Children"
**Today** (session leader, group leaders, leads):
- **Counts: in · not arrived · leaders.**
  - "In" and "not arrived" exist (K2/K3).
  - **"Leaders" is missing:** leaders don't check in to a Sunday session
    today. E1 has leader check-in for events (`kind: 'leader'`), so I'd reuse
    it for the kids' morning, with a "Check myself in" button on Today.
- **Needs in the room:** exists ("Allergies and medical needs in the room
  now", K3). The app shows it at the top. Who sees the detail stays as the
  rules have it: the leads, that group's leaders, and the Session Leader for
  checked-in children.
- **Call a parent:** "Show on screen" (ChurchShow, F-100) and "Ring" exist.
  **"Buzz the parent's phone" waits for notifications** (FINDINGS-notify,
  hooks only for now). One button does all the parent's ways at once, as
  in the mock-up.
- **Check-in desk** and **fire roll-call**: exist (Sunday check-in, Desk
  and Roll-call tabs). The app opens them.

**Children** (the leader's group): exists as the leader screen and the
Children's register. Missing: the **"Renew"** pill a month before consent
runs out (today it only turns red when it has run out). Small.

### F-121 — Home, "This Sunday, for parents": the family QR and "Check in Ada and Ben"
Martin put this on Home, so **parents checking in on their own phone**
(F-094d, "later") is now in the design. Home is the main window's, but the
data and the rules are mine. Needed:
1. **A parent can read their own family's code and children's names**, and
   nothing else. They're matched by the email on the registration form, or
   the optional second parent's email (N-6). New rules in my section, with
   tests.
2. **"Check in Ada and Ben"** writes the same check-ins as the desk (E1/K2).
   **DECISION for Martin (A-K1):**
   - When a parent checks in on their phone, who prints or gives the labels
     and the collection code?
   - Recommended: the phone shows the collection code and each child's
     label on screen, the child goes to their group's door, and the group
     leader sees them arrive on "Today".
   - The other way: the phone check-in only tells the desk they're coming,
     and the desk still prints labels.
3. A helper for Home, `myFamilyThisSunday()`, which the main window calls.

### F-122 — What's on, Your events, Book a room
- **What's on** exists, with "Who can come" (F-114). The app tab opens it.
  The mock-up's quick filters ("This month", "For families", "Courses") are
  the event categories already there; a small change.
- **The event sheet:**
  - "You + 2 booked, change or cancel" exists (`my-signup.html`).
  - "Add to my calendar" exists (ICS).
  - "Share on WhatsApp" exists on the events admin page; it needs adding to
    the member's view. Small.
- **"Your events" on Home** (main window's Home, my data): a helper
  `myEvents()` that lists the person's own sign-ups. The rules already
  allow exactly that list (signups where `memberUid` is them).
- **Book a room:**
  - Exists (`rooms.html`, `book.html`), including members' bookings that
    confirm straight away where the room or site says so.
  - Missing for the app's quick view, "Free from 6pm today" per room: a
    small helper from the day's slots.

### F-123 — Maintenance space (new)
**Jobs:**
- A new collection, `maintJobs`:
  - fields: what, where (room), photo (optional), reported by and when,
    status (to do, done), done by and when
  - **anyone signed in** may report a job
  - the **Maintenance team** (and admins) mark jobs done; everyone sees the
    list
- A photo of the problem would use the E4 upload pattern (approved before
  it shows), or no photos at first. **Decision for Martin (A-M1).**

**Rooms, "Close a room":**
- **Built on my bookings**, as the brief says: a new booking kind,
  `closure`.
  - It holds the room's slots for the chosen days, with a reason (required).
  - The Maintenance team, the office and admins may make one.
- A closure **may cover times already booked** (the rules' override with a
  reason already exists for the office). Anyone already booked is
  **emailed a warning**, and the office is told. Their booking isn't
  cancelled automatically: the office decides.
- On **Book a room**, a closed room shows "Closed for maintenance" with
  the reason on those days, and can't be picked. **Decision for Martin
  (A-M2):** hide it completely for those days (the brief says it
  "disappears"), or show it as closed? Recommended: "disappears" on Book a
  room, and "Closed" on the office's bookings calendar.
- **Needs the main window:** a **Maintenance team** must exist as a team
  (§6 "teams are data"), so its members get the space and the rules can
  test `'Maintenance' in teams`.

### F-124 — Listen (sermons and the podcast)
- **Data:**
  - `sermons`: title, speaker, date, series, Bible passage (book, chapter,
    verses), length, audio, size, and published or not
  - `sermonSeries`: name, artwork, order
- **Audio** goes in Firebase Storage (`sermons/<id>.mp3`), public to read
  (it's a public podcast), uploaded only by sermon admins. Storage supports
  the "range" requests podcast apps need. Size: about 30 MB a sermon, so
  48 past sermons is about 1.5 GB. Storage costs pennies; downloads are
  about 12p a GB.
- **The player:**
  - an ordinary audio player, with lock-screen controls (the Media
    Session API, which Android and iPhone both show)
  - **it remembers your place**: on the phone, and for a signed-in person
    also in `listenProgress/<uid>`, so "Carry on listening" works on any
    device
  - search by speaker, Bible book or date
- **Admin upload page**, `sermons-admin.html`:
  - pick the file, fill in the details, publish
  - who: master admins, and the admins of a team Martin names (for
    example, Preacher / Service Leader)
  - the 25–48 ChurchSuite sermons Martin downloads go in through the same
    page, with their original dates
- **The podcast feed (RSS):** one public, permanent address that Spotify
  reads. **Two ways:**
  1. **A file in Storage** (`podcast/feed.xml`), rewritten by the admin page
     each time a sermon is published. No server code. The address is a
     long Storage address, but it never changes.
  2. **A small Cloud Function** (`podcastFeed`, codebase "hub", the main
     window's) that builds the feed from `sermons` whenever it's asked.
     Cleaner, and it can't be out of date. It needs the main window and a
     deploy.

  **Recommended: 2.** **Decision for Martin (A-L1).**
- **Repointing Val's Spotify show, never a new one:**
  - The new feed must carry **the same show name, artwork, description and
    owner email** as the current show.
  - It must carry **every existing episode with the same episode ID
    (`guid`)**, or Spotify shows them all twice.
  - Then, in **Spotify for Creators**, Val uses the show's "move / redirect
    to a new host" setting and gives the new feed address. The old feed
    sends listeners on, and followers stay.
  - **Needed from Martin or Val (A-L2):**
    - the show's **current RSS address** (I import the existing episodes'
      IDs and dates from it)
    - who holds the Spotify for Creators login (Val)
    - the artwork (3000×3000)
    - the **owner email** to put in the feed (Spotify sends a check code
      there)
  - The repointing itself is done **by Val, by hand**. I'll write the steps
    in plain words when the feed exists. Nothing is touched on Spotify
    before that.

### F-125 — REQUESTS for the main window (the app)
- **A1:** how my screens sit in the shell (F-119), and the bottom bar size
  and safe areas.
- **A2:** the spaces and tabs that open my screens:
  - Kids Church: **Today** and **Children**
  - Me and my family: **What's on** and **Listen**
  - Maintenance: **Jobs** and **Rooms**
  - Running things: **Bookings**, which opens Room bookings, with
    "Approve?" from my `bookings` data
- **A3:** a **Maintenance** team in the teams data, and teams as data
  generally (§6), so my rules can name `'Maintenance'`.
- **A4:** Home calls my helpers:
  - `myFamilyThisSunday()` (F-121)
  - `myEvents()` (F-122)
  - `myGroupsNext()`: the next meeting of each of my groups, from
    `smallGroupMeetings` and the group's day (exists in pieces)

  These go in a small `egbc-events-home.js`. The main window draws them.
- **A5:** **the family rule:** "Your family this week" needs the household
  (`EGBCRotaPdf.householdIds`). Children's Sunday groups are in `kids*`,
  matched to a family by the registration email, not the address book
  household. I'll join them by the parent's sign-in email, so Home shows
  "Kids Church · Ada and Ben" for that parent. Youth groups (Lazers and so
  on) via the household are the main window's (YOUTH-ACCESS).
- **A6 (if Listen is built with a function):** `podcastFeed` in codebase
  "hub", from my spec (F-124).
- **A7:** F-115 (sign-ups check "Who can come"), still open.

### F-126 — the order I'd suggest
1. Kids Church Today and Children (mostly there already), with leaders
   checking in.
2. Parents' Sunday on Home (F-121), once Martin decides A-K1.
3. Close a room and Jobs (needs the Maintenance team, A3).
4. Listen: the upload page and the player first; the feed and the Spotify
   repointing last (needs A-L1 and A-L2).
5. The small What's on and Book a room additions, alongside.

### F-127 — Martin's decisions on the app plan (9 October 2026)
- **A-K1:** the collection code shows on the parent's phone. The child's
  label prints when the phone's code is scanned at the door, or shows on the
  leader screen if there's no printer.
- **A-M1:** one optional photo per maintenance job, seen by the Maintenance
  team and the office only.
- **A-M2:** a closed room disappears from Book a room for those days.
- **A-L1:** the podcast feed is a server function.
- **A-L2:** Martin is getting the details from Val.
- **Order:** Kids Church Today waits for the main window's answer on A1
  and A2. Meanwhile I build what doesn't depend on the shell: the
  Maintenance jobs; then the sermons storage, upload page and feed function.

### F-128 — what Maintenance jobs built (the app's Maintenance space, "Jobs")
- **`maintJobs`**: what, where (a room, or "somewhere else"), more detail,
  one optional photo, who reported it and when, to do or done, who did it,
  when, and a note. Never deleted.
- **Who does what (the rules):**
  - anyone signed in (Attenders included) reports a job, and sees the list,
    so nobody reports the same thing twice
  - the person who reported it may add detail or the photo while it's to do
  - **the Maintenance team** (anyone with "Maintenance" in their teams) and
    **the office** (admins, and the bookings admins of the job's site) mark
    it done (in their own name, with an optional note) or open it again
- **The photo (Martin, A-M1):** one per job, at `maintJobs/<job>/photo` in
  Storage. Only the person who reported the job puts it up, while the job is
  to do. **Only the Maintenance team and the office see it.** Not the
  public, not other members, and not even the person who took it, once it's
  sent.
- **`maintenance.html`, "Maintenance":**
  - the jobs list first, then "+ Report a job"
  - the photo can come straight from the phone's camera
  - the team and the office get "Mark done", "Open again" and "See the
    photo"
  - phone sizes as the app brief asks: 48px targets, bottom safe area, and
    the Maintenance colour
  - it works on its own now, and opens inside the app's Maintenance space
    once the shell is ready (A1, A2)
- **Not yet:** nobody is told when a job is reported. That would be a
  notification to the Maintenance team (notifications are on hold), or an
  email, which needs the team's addresses now the address book is closed.
  Say if an email is wanted now.
- **Needs the main window (A3, still open):** a **Maintenance** team in the
  teams data, so people can be put on it. Until then only admins and the
  office can mark jobs done.
- Tests: rules (maintenance jobs, 16 checks); storage (the photo, 9);
  maint-jobs in the browser (13).

### F-129 — REQUEST for the main window: email the Maintenance team when a job is reported (Martin, yes)
The address book is closed, so a page can't find the team's emails. This
needs a server step. **Please add a function in codebase "hub":**
- **Trigger:** a new document in `maintJobs` (Firestore "on create"), so
  the page needn't call anything.
- **To:** every person on the **Maintenance** team (once A3 exists, from the
  teams data and their address book emails). Each person gets their own
  email: no group list, so addresses stay private. If nobody is on the team
  yet, send to the church's office email (`churchSettings/details.enquiryEmail`)
  so a job is never lost.
- **Subject:** `Maintenance: <what>` (for example "Maintenance: Two lights out").
- **Body, plain words:**
  - what's wrong, where, and any detail they wrote
  - who reported it and when
  - a link to the job:
    `https://esherchurch.github.io/availability-form/v2/maintenance.html#<jobId>`
- **No photo in the email**, not attached and not linked straight to the
  file (Martin, A-M1). The link opens the page, and the page shows the photo
  only to the team and the office, once they're signed in.
- Sent through the same email route the other functions use, with no reply
  address beyond the church's.
- **The job's fields** (from F-128): `what`, `where`, `details`,
  `reportedByName`, `reportedAt` (server time), `siteId`, `roomId`,
  `photoPath` (don't use it in the email), `status` (`todo` when made).
- **Tests I'd suggest:** a new job sends one email to each team member;
  nothing is sent when a job is updated or marked done; no team means one
  email to the office address; the email holds no Storage address.

I'll make `maintenance.html` open the job named after `#` in the link,
scrolled to it.

### F-130 — what Kids Church "Today" and "Children" built (the app's Kids Church space)
Built to the main window's shell contract (FINDINGS-app A-050):
- **`egbc-app-kids.js`** provides the two screens, `kids_today` and
  `kids_children`. The shell calls `EGBCAppKids.register(V, { row, sec,
  next, ic, esc, redraw })` once.
  - The module loads its own data, keeps its state itself (the shell
    redraws from scratch), and asks for a redraw when check-ins change.
  - Its buttons that *do* something (check myself in, show on screen,
    done) use `data-kact`, handled in the module. Navigation stays on the
    shell's `data-act`.
- **Today:**
  - **in · not arrived · leaders**
  - **"Check myself in" / "Check myself out"** for leaders (new)
  - **Needs in the room:** the allergies and medical needs of the children
    in now, as each person may see them. A group leader sees only their own
    group's; the Session Leader sees every child checked in.
  - **Call a parent:** "Show on screen" (the code only, F-100), "Ring",
    "On the screen now" and "Done". Only for those who hold the codes (the
    leads and group leaders); the Session Leader is told who can.
  - **Check-in desk** (leads) and **Fire roll-call**, which open those tabs
    of Sunday check-in (`kids-checkin.html?tab=desk`, `?tab=roll`; that page
    now honours `?tab=`).
  - Someone with no part this morning sees a plain note, never an empty
    screen (A-050).
- **The rota's Session Leader, first in, opens the morning from the app**,
  as Sunday check-in does (F-098).
- **Children:** each of the person's groups, with who is in, not arrived or
  gone home, and who may collect. **"Renew"** shows when consent runs out
  within a month, and **"Consent ran out"** after. The Session Leader sees
  who is in now, by group.
- **Leaders checking themselves in (new, `kidsLeaderIns`):**
  - one record per leader per site per day
  - a leader checks only themselves in or out, and only if they lead this
    morning (a lead, a group's leader, or anyone on the morning)
  - the leads and that morning's leaders see them
  - **the fire roll-call now lists "Leaders in"**
- **"Renew"** also shows on Sunday check-in and on the Children's register.
- **Escaping:** the mock-up's `row()` and `sec()` don't escape what they're
  given, so the module escapes everything from the database first.
  **For the main window:** worth deciding whether the real shell's helpers
  escape, and saying so in the contract.
- **Tested through a stand-in shell** (`screenshots/events/app-harness.html`,
  test only, not a live page). It's built from the mock-up's own helpers and
  styles, to A-050.
- Tests: rules (leaders checking in, 13 checks); kids-today in the browser
  (17).

### F-131 — for the main window: two things the shell contract doesn't say yet
1. **A redraw when data arrives.** The screens are drawn at once, but the
   check-ins arrive later. I've asked for `redraw` among the helpers passed
   to `register()`. Please confirm the real shell will provide it, or say
   how a screen should ask to be drawn again.
2. **Buttons that act rather than navigate.** "Check myself in" and "Show
   on screen" write to the database. The contract has `data-act` for
   navigation only. I've used `data-kact` with my own click handler. Please
   confirm that's fine, or give the shell a way to register an action.

### F-132 — what the sermons ("Listen") built
- **Data** (rules in my section, tests 45 in Firestore and 15 in Storage):
  - `sermons`: title, speaker, date, series, Bible book and passage, notes,
    audio (path, type, size, length), published, and the **episode ID**
    (`guid`).
  - `sermonSeries`: name, a line about it, a square picture.
  - `sermonShow/show`: the podcast's name, description, author, owner name
    and email, website, artwork, and the list of Val's old episode IDs.
  - `sermonShow/access`: the people a master admin names to put sermons up.
  - `listenProgress/<uid>/sermons/<id>`: each listener's place, theirs
    alone (not even a master admin reads it).
- **The rules:**
  - A sermon is public once published (it's a public podcast). Until then
    only the uploaders see it, and its audio can't be fetched.
  - It can't be published until its audio is up and measured.
  - **An episode's ID never changes.** A new sermon's is
    `egbc-sermon-<id>`; one brought over from Val's show keeps the show's
    own. Change it and Spotify shows the episode twice.
  - Nothing is deleted: unpublish instead.
  - Audio: MP3, M4A, AAC or WAV, under 300 MB. Artwork: JPEG or PNG,
    under 10 MB.
- **`sermons-admin.html`** (the upload page):
  - **Add a sermon:** the file, title, speaker (it suggests past speakers),
    date (last Sunday by default), series, Bible book, passage and notes,
    then "Publish it". The page reads the recording's length itself, and
    shows a progress bar while uploading.
  - **The list:** each sermon is marked Published, Not published or Needs
    its audio, with Change, Publish and Unpublish buttons.
  - **Series:** add one, with a picture.
  - **The podcast:** the show's details and artwork.
  - **Bring over Val's show:** save the show's RSS page and choose the file
    (or paste it in).
    - Every episode comes in, not yet published, with **its ID exactly as
      it was**, its original date and time, and its old audio address kept
      for the record.
    - The show's details fill in wherever ours are still empty.
    - Doing it twice adds nothing twice.
  - **"Ready to repoint Spotify?"** says what is still missing:
    - the artwork or the owner email
    - any old episode without its audio or not published
    - two sermons with the same ID

    It says "Ready" only when nothing is missing.
  - **Preview the feed:** builds it with the same file the server will use,
    and checks that it reads.
  - **Who can add sermons** (master admins only): add or remove people.
- **`egbc-app-listen.js`** (the app's Me and my family → Listen, to the A-050
  contract):
  - the newest sermon with Play and Whole series
  - "Carry on listening", with the time left
  - search by speaker, Bible book, title, series or date ("september 2025",
    "4 Oct")
  - the series (each opens its sermons in order) and the recent sermons
  - **The player outlives the screen:** it isn't part of the screen, so it
    keeps playing when the person goes to another tab. The lock screen gets
    play, pause and skip.
  - **It remembers your place:** on the phone straight away, and in the
    person's own record every 30 seconds, on pause, and when the app is put
    away. So another phone carries on from the same point.
  - It shows published sermons only, and never a draft.
- **`egbc-sermons-feed.js`** builds the podcast feed (RSS) from the data, and
  reads Val's old feed. It's a plain function: no database, no network. The
  upload page uses it for the preview and the readiness check. The feed
  function should use the same file (F-133).
- **The stand-in shell** (test only) now opens Me and my family → Listen as
  well as Kids Church.
- **Tests:**
  - rules: 45 (Firestore) and 15 (Storage)
  - feed builder: 25 (`sermons-feed-unit`)
  - browser: 32 (`sermons`)
  - Kids Today still passes 17 of 17 with the updated stand-in shell

### F-133 — REQUEST for the main window: the podcast feed function (Martin, A-L1; your A-050 A6)
**Please add `podcastFeed` in codebase "hub":**
- **What:** `onRequest({ cors: false, invoker: 'public' })`, GET (and HEAD),
  no sign-in. It's a public podcast, like `rotaFeed`.
- **Reads, with the Admin SDK:**
  - `sermonShow/show`
  - every `sermonSeries`
  - `sermons` where `published == true` (one field, so no new index)
- **Builds the feed with `egbc-sermons-feed.js`:**
  ```
  EGBCSermonsFeed.buildFeed({ show, series: { id: data }, sermons: [{ id, ...data }],
    bucket: <the default bucket>, feedUrl: <this function's own address>, now: new Date() })
  ```
  - The file works in the browser and as CommonJS. The functions folder is
    ESM, so copy it in as `functions/sermons-feed.cjs` and load it with
    `createRequire`. Or tell me the shape you'd prefer and I'll provide it.
  - **A copy can drift.** A small check that the two files are the same
    (yours) would stop that. My unit test
    (`screenshots/events/sermons-feed-unit.test.mjs`) is the specification.
- **Sends:** `Content-Type: application/rss+xml; charset=utf-8`, with
  `Cache-Control: public, max-age=900` (Spotify checks the feed often; 15
  minutes is enough).
- **The address must never change.** Martin gives it to Val once, for
  Spotify. Keep the name and region (`europe-west2`, as `setGlobalOptions`
  sets) for good.
- **The audio addresses in the feed** are plain Storage addresses with no
  token. The storage rules make a published sermon's audio public and a
  draft's not. So **Martin must deploy storage.rules before the feed is
  given to anyone.**
- **Once live, please check by hand** that a partial download works:
  `curl -r 0-99 -I <an enclosure address>` should answer `206`. Podcast apps
  need that to skip ahead. Google Storage does it; this just confirms it.
- **What it must never do:**
  - list an unpublished sermon (the builder leaves them out)
  - change an episode's `<guid>`
  - invent a guid for an imported sermon
- **Tests I'd suggest:**
  - a draft isn't in the feed
  - an imported sermon's guid comes out exactly as stored
  - the content type is right
  - a sermon with no audio isn't in the feed

### F-134 — sermons: open points
1. **Who puts sermons up (Martin):** master admins always can. Anyone else
   is named on the upload page by a master admin. There's no Preacher team,
   and naming people needs no code. Say if it should be a team instead.
2. **Menu (main window):** `sermons-admin.html` needs a Menu entry
   (`egbc-menu.js` is yours). Suggested: under Admin, "Sermons", for master
   admins and the people named in `sermonShow/access`.
3. **From Val (A-L2, still open):** the show's current RSS address, the
   3000×3000 artwork, the owner email Spotify checks, and who holds the
   Spotify for Creators login.
4. **The old episodes need their audio before the switch.** Otherwise they
   vanish from Spotify, and the readiness check says so.
   - Martin has the ChurchSuite downloads.
   - Each brought-over episode also keeps its old audio address, so any
     that ChurchSuite doesn't have can be saved from the old show **while it
     still serves them**.
5. **The repointing itself is Val's, by hand, and last.** I'll write the
   steps in plain words once the feed is live and the page says "Ready".
   Nothing has been touched on Spotify.
6. **For the shell (main window):** the player keeps playing across tabs,
   but its buttons are only on Listen (and the lock screen). Does the shell
   want a small "now playing" strip above the tab bar?
   `EGBCAppListen.nowPlaying()` says what's playing.

### F-135 — what "Close a room" built (the app's Maintenance space, "Rooms"; Martin, A-M2)
- **Data** (rules in my section, 26 new checks):
  - `roomClosures/<id>`: the room, its days (one month at most), the reason
    (required), who closed it and when, and later who lifted it, and whether
    the office has warned the people booked. Anyone in the address book reads
    it.
  - `roomClosedDays/<room>_<day>`: one marker a day. Anyone may read it,
    because the public booking page needs it. **It says only "closed", never
    why.**
- **Who:** the Maintenance team, and the office of the room's site (admins
  and its bookings admins). An Attender can't.
- **The booking rules now read the marker.** On a closed day:
  - **members and the public can't book the room or ask for it**, whatever a
    page does
  - the office can, but only by booking over it, with a reason (as for any
    clash)
  - the day after, it books as usual
- **A day's marker can only be switched on** for a day its closure names,
  for that room, while the closure is on. It can only be switched off by
  lifting the closure it belongs to. Nothing is deleted.
- **Where it shows:**
  - **App, Maintenance → Rooms** (`egbc-app-maint.js`, `maint_rooms`):
    - each room, Open or Closed (the days and the reason)
    - tap a room to choose the days and the reason, then "Close the Hall"
    - a closed room shows its details and "Open it again"
  - **maintenance.html:** a "Close a room" card for the team and the office,
    with the same closing and lifting (both use `egbc-events-bookings.js`).
  - **Book a room (rooms.html):**
    - **a closed room disappears from the day view** on those days
    - its week shows those days as closed
    - asking for it says "not free then (closed that day)"
  - **The public page (book.html):** "The room is closed that day."
  - **Room bookings (bookings-admin.html):**
    - each closure appears under Waiting, with the reason, who closed it, and
      **who is booked then**
    - **"Warn the people booked"** emails each of them in one go. Their
      booking is kept: the office decides what comes next.
    - the day view shows "Hall · closed"
- **The office is emailed** when a room is closed or opened again (the
  site's bookings address, or the church's enquiry email).
- **Warning the people booked is the office's job, by design:** the
  Maintenance team can't see other people's bookings (the rules), so the
  page can't email them. One button on Room bookings does it, and the
  closure records that it has been done.
- **Found while testing:**
  - maintenance.html wasn't loading `egbc-email.js`, so closing a room from
    that page couldn't have told the office. It's fixed.
  - The jobs list used ✓ and ⚙ as icons (the style sweep counts those as
    emoji). Both are now Lucide icons, with a door for a closed room.

### F-136 — what "What's on" and "Book a room" built for the app (Me and my family)
- **`egbc-app-whatson.js`** (`me_whatson`, to the A-050 contract):
  - **The list** shows exactly what What's on shows that person, from the
    same query. Members-only items stay hidden from those who can't come;
    the rules see to that.
  - **Pills:** "Booked" (or "Waiting list"), "Sign up", "Members",
    "Cancelled".
  - **Quick filters:** "This month", then the kinds of event in the list,
    with Kids and families called "For families".
  - **An event's own view:**
    - when, where and the description
    - **"You + 1 booked: change numbers or cancel"**, which opens their own
      booking; or "Sign up"
    - **"Add to my calendar"**, a calendar file
    - "The full page"
  - **Book a room:** each room members can book, as it is today: "Free
    until 6pm", "Booked until 8pm, then free", "Free all evening". **A room
    closed today isn't there at all.** Tapping a room opens Book a room.
- **`egbc-events-home.js`**, for Home (A-050 A4): **`myEvents()`** returns
  the person's own bookings for events still to come, as plain data (the
  title, when, where, places, waiting or not, and the links to manage it
  and to the event). It only ever reads their own; the rules allow nothing
  else.
- **Share on WhatsApp is not built:** the brief says one shared helper,
  `egbc-share.js`, and it doesn't exist yet. The button goes in the event
  view once the main window has made it.

### F-137 — REQUESTS for the main window
1. **A "Sermons" role (Martin, on F-134).** Martin wants who can upload
   sermons to be a tick in the address book, alongside master admins.
   Please add:
   - the tick in the address book
   - mirrored onto `users/{uid}` and checked by `mirrorsBook()`, like the
     others

   I'd suggest a field of its own (for example `roles: ['Sermons']`), **not
   `adminFor`**: `adminFor` makes `isAdmin()` true, which would open
   everything an admin can do. Tell me the field, and I'll switch
   `sermonAdmin()` (Firestore) and `sermonAdminHere()` (Storage) to it, with
   tests. I'll also replace the "Who can add sermons" list on the upload
   page with a note pointing to the address book. Until then, the list on
   the page works.
2. **The "Now playing" bar above the tabs (Martin, yes).** It's the shell's
   to draw. `egbc-app-listen.js` now gives it:
   - `EGBCAppListen.nowPlaying()`: `null`, or `{ id, title, speaker, series,
     pos, dur, paused }`
   - `EGBCAppListen.toggle()`: play or pause
   - `EGBCAppListen.onChange(fn)`: told when the sermon, its place or
     play/pause changes, at most four times a second

   Suggested:
   - a slim strip, the title and a play/pause button, at least 48px high
   - it sits above the tab bar and clears the safe area (A1c)
   - tapping the strip goes to `go:me:listen`
   - it shows only while `nowPlaying()` isn't null

   The sermons browser test checks that `onChange` is told what's playing.
3. **What the shell must load** for my screens, in this order:
   - Firebase app, auth, firestore and **storage**
   - `egbc-auth.js`, `egbc-church.js`, **`egbc-email.js`**, `egbc-ics.js`
   - `egbc-events.js`, `egbc-events-kids.js`, `egbc-events-checkin.js`,
     `egbc-events-bookings.js`, `egbc-events-home.js`
   - then `egbc-app-kids.js`, `egbc-app-listen.js`, `egbc-app-whatson.js`,
     `egbc-app-maint.js`
   - each module's `register(V, { row, sec, next, ic, esc, redraw })`

   Without `egbc-email.js`, closing a room couldn't tell the office.
4. **Still mine and not built:** the app's Maintenance "Jobs" screen
   (`maint_jobs`; maintenance.html has it today) and Running things →
   Bookings (`office_bookings`). Both are next if wanted.
5. **The style sweep (A-054):** fixed both:
   - places-admin's "↑" and "↓" are now Lucide arrows with "Move up" and
     "Move down" labels (a tap on the icon still moves the room)
   - every h2 on Room bookings is 600 (the two outside a card were falling
     back to the browser's bold)

   I also swapped maintenance.html's ✓ and ⚙ before the sweep found them.
   Please add `maintenance.html`, `sermons-admin.html` and `bookings-admin.html`
   to the sweep's list if they aren't on it.

### F-138 — Sermons, Martin's option 3: the hub reads Val's podcast (replaces the repointing plan)
**Martin's decision:**
- Val keeps uploading to Spotify for Creators (Anchor), as now.
- The hub reads that show's public RSS feed automatically.
- Nothing moves, and **Spotify is not repointed**.

**Built:**
- **`egbc-sermons-feed.js`** is rewritten. It reads the feed, and decides
  what to write for each episode (create, update or leave alone), matched
  by the episode's guid.
  - The sermon's document id is made from the guid and nothing else
    (`idForGuid`), so **reading the feed again can never make a second
    copy**.
  - A read refreshes only the feed's own fields: title, date, words, audio
    address, length.
  - It **never touches what the hub adds**: series, Bible book and passage,
    speaker, and shown or hidden.
  - A new episode arrives shown.
  - A feed that won't read changes nothing, and says why.
- **Rules** (my section; 40 sermon checks):
  - **No page can make a "feed" episode.** Only the function writes them,
    with the Admin SDK.
  - On a feed episode, the hub may change only the speaker, series, book,
    passage and shown or hidden. **The title, words and audio stay the
    feed's.**
  - The feed's address (`sermonShow/feed`) is a setting the sermon people
    set. It must be `https://`.
  - `sermonShow/feedStatus` (what the last read found) is the function's
    alone to write.
  - An upload made by hand (the backup way) works as before.
- **The upload page (sermons-admin.html):**
  - every episode is marked "From Spotify" (or "Uploaded here"), with "Add
    series and passage", and Hide or Show
  - the podcast's RSS address, and what the last read found
  - "Upload a sermon by hand" is kept as the backup
  - series, and who may look after sermons
  - **Removed:** "Ready to repoint Spotify", bringing over the old show, the
    show's details and artwork, and the feed preview
- **The player (Listen):** plays a feed episode from **the feed's own audio
  address**, and an upload from Storage. Everything else is unchanged:
  - series, search and "Carry on listening"
  - it keeps playing across tabs
  - the "Now playing" bar hooks (F-137)

  "Also on Spotify: search for …" now takes the show's name from the last
  read.
- **Tests, with an invented feed and audio served from this machine:**
  - feed unit test: 15
  - sermons browser test: 27 (it plays the function's part itself, with the
    same file, against the emulator)
  - Both prove that a second read makes no second copy, and that the hub's
    additions and a hidden episode survive reads.

### F-139 — REQUEST for the main window: `sermonFeedSync` (and F-133 is no longer needed)
**F-133 (the hub-hosted podcast feed, `podcastFeed`) is no longer needed.
Please don't build it.** Martin chose option 3: Spotify isn't repointed.

**Please build instead, in codebase "hub":**
- **`sermonFeedSync`**, `onSchedule('every 60 minutes')`, in the hub's
  region (`europe-west2`).
- **Read the address** from `sermonShow/feed.url`. If it's empty, do
  nothing.
- **Fetch it:**
  - time out after 20 seconds
  - read at most 10 MB
  - follow redirects
  - send a plain `User-Agent` naming the church hub
- **Hand the text to `EGBCSermonsFeed.sync(store, text, new Date())`** from
  `egbc-sermons-feed.js`. Copy it in as `functions/sermons-feed.cjs`
  (CommonJS; it uses the global `btoa`, which Node 16+ has). The store:
  ```
  get(id)          -> (await db.doc('sermons/' + id).get()).data() || null
  create(id, data) -> db.doc('sermons/' + id).create(data)   // create(), not set(): it fails rather than overwrite
  update(id, data) -> db.doc('sermons/' + id).update(data)
  status(data)     -> db.doc('sermonShow/feedStatus').set(data)
  ```
- **If the fetch itself fails** (network, a 404), write only
  `sermonShow/feedStatus` with `{ lastReadAt, ok: false, error }` (the error
  in plain words), and change no sermon.
- **Never delete a sermon**, even if an episode leaves the feed.
- **My tests are the specification:**
  - `screenshots/events/sermons-feed-unit.test.mjs`
  - the store part of `screenshots/events/sermons.test.mjs`

  Tests I'd suggest on your side:
  - two runs on the same feed make no new documents
  - a hub-set `seriesId` survives a run
  - a fetch error writes the status only

**Where the address comes from:** Martin will get it from Val (in Spotify
for Creators, under Settings, the RSS feed), and it goes in on the Sermons
page. Until then nothing comes in, and the page says so.

**The CORS point:** a page can't fetch the feed itself; the podcast host
doesn't allow it. That's why this is a server step.

### F-140 — my APP-A1 screens, now on the real shell; Jobs and Bookings built
**On the real shell.** The main window's `egbc-app.js` differs from the
mock-up my screens were built against: the helpers escape text themselves
(APP-A1 §5), `sec()` and `next()` take their arguments in a new order, and
screens register with `EGBCApp.screen()`. So:
- **`egbc-app-events.js`** (new) is where my screens meet the shell.
  - **`EGBCAppEvents.mountAll(EGBCApp)`** mounts every one of mine that is
    loaded.
  - It gives each screen the shell's own helpers in one shape.
  - My screens now pass **plain text** to `row`, `sec`, `next` and `head`,
    and escape only HTML of their own (pills, cards, attributes).
- Kids Church Today and Children, What's on, Listen and Close a room are
  moved over. Their tests pass on the real shell: Kids Today 17, Sermons 27,
  What's on 15, Close a room 27.
- **The test stand-in is now the real shell.**
  `screenshots/events/app-harness.html` loads `egbc-app.js` with app.html's
  own styles and mounts my screens exactly as the shell will.

**Built:**
- **Maintenance → Jobs** (`maint_jobs`, in `egbc-app-maint.js`), the same
  jobs as maintenance.html:
  - to do, then done
  - "Report a job": where, what, detail, and one photo
  - a job's own view: for the team and the office, "See the photo", "Mark
    done" with a note, and "Open it again"
- **Running things → Bookings** (`office_bookings`, `egbc-app-office.js`):
  - **Requests:** what is waiting at the person's own sites, each marked
    "Approve?". **A free booking for one date is approved or declined on the
    phone**, through the same code as Room bookings, and the person is
    emailed. Declining asks why.
  - **Sent to Room bookings:** a booking with a price to confirm, or a
    series of dates, because the price and the series belong on the full
    page. So are hirers asking to cancel, and closed rooms with people still
    to warn.
  - **A room closed that day is never approved from the phone.**
- **For Home and Today** (`egbc-events-home.js`), each returning plain data:
  - **`myGroupsNext()`:** the next meeting of each of the person's groups.
    It skips a meeting the leader called off, and gives the area, never the
    address.
  - **`officeQueue()` and `officeToday()`:** what is waiting for the office,
    and the counts for Running things' Today (room requests, cancellations
    asked for, closures to warn, jobs to do).
  - `myEvents()` was already there.
- **Tests:** `app-jobs-office` (24). It includes page code typed into a job
  and into a booking's title, both shown as text and never run.

**Still mine, next:** the parents' Sunday on Home, "This Sunday, for parents"
(F-121): the family's code on the parent's phone and checking in from it
(Martin, A-K1), with `myFamilyThisSunday()`. It needs new rules for a parent
to read their own family, so I've kept it as a stage of its own.

### F-141 — REQUESTS for the main window (the shell)
1. **Load my screens in app.html, after your own screens:**
   - **Scripts:** add `firebase-storage-compat.js` (photos and the backup
     sermon audio), then:
     - `egbc-church.js`, `egbc-email.js`, `egbc-ics.js`
     - `egbc-events.js`, `egbc-events-kids.js`, `egbc-events-checkin.js`,
       `egbc-events-bookings.js`, `egbc-events-groups.js`,
       `egbc-events-home.js`
     - after `egbc-app.js`: `egbc-app-events.js`, `egbc-app-kids.js`,
       `egbc-app-listen.js`, `egbc-app-whatson.js`, `egbc-app-maint.js`,
       `egbc-app-office.js`
   - **On `egbc-ready`:** call `EGBCAppEvents.mountAll(EGBCApp)` before
     `EGBCApp.start()`. My screens replace your interim ones for
     `me_whatson`, `maint_jobs` and `office_bookings` (the same space and
     tab), and add `kids_today`, `kids_children`, `me_listen` and
     `maint_rooms`.
   - Home's Listen row can come back once Listen is mounted.
2. **`watch()` is called again on every draw.** `draw()` stops the last
   watcher and calls `entry.watch()` each time, including the redraws that
   `refresh()` causes. A Firestore listener answers as soon as it starts, so
   a screen that refreshes on new data would loop: draw, watch, answer,
   refresh, draw…
   - Suggested: call `watch` only when the space or tab changes (remember the
     last `space_tab` it was started for), and not on a `refresh()`.
   - Until then, my screens don't use `watch`. They start their listeners
     once per page and ask for a redraw, which never multiplies them.
3. **Pills and small notes aren't styled by the shell yet.** `.pill`,
   `.pill.warn`, `.pill.n` and `.example` are the mock-up's.
   - `egbc-app-events.js` adds a fallback inside `:where()`, so it weighs
     nothing and your rules win once you add them.
   - 12px, not the mock-up's 11.5px (DESIGN.md's floor).
4. **Running things for a site's bookings admin:** `spacesFor()` gives
   Running things only to admins and the Core Team. A site's bookings admin
   who is neither (as the office often is) won't see Bookings, though the
   rules let them decide their site's bookings. Is that intended?
5. **Home's helpers are ready:** `myEvents()`, `myGroupsNext()` and
   `officeToday()`, each plain data. `myFamilyThisSunday()` comes with F-121.
6. **Share on WhatsApp** still waits for `egbc-share.js`.

**F-141 item 4, answered (Martin, NEXT-BRIEF §25):** the main window is
building group-based access to Running things. Anyone in a site's
`bookingsAdmins` gets the Bookings tab automatically. `bookingsAdmins` stays
as it is, and nothing changes on my side.

### F-145 — what Parents' Sunday built (Home, "This Sunday, for parents"; F-121, Martin A-K1 and N-6)
**How it works on a Sunday (A-K1):**
- **Before arriving:** the parent's phone shows the **family code and its QR
  code**. At the door, the desk scans it with the scanner it already has,
  ticks who is here, and the labels print with that morning's collection
  code (or show on the leader screen if there is no printer).
- **Once in:** the phone shows **who is in and in which group, and the
  collection code**.

**Who sees it** (rules in my section, 16 new checks):
- **A parent sees only their own family.** They are matched by the email on
  the registration form, or the optional **second parent's email** (N-6c,
  now on the form and kept on the family as `email2`), to the email they
  sign in with.
- **Only a verified sign-in email counts**, so nobody can claim a family by
  typing its address.
- **Signed in is enough:** a parent need not be in the address book (§21,
  N-6b).
- What a parent can read:
  - their own family record
  - their own children (names and groups)
  - this morning's check-ins **for their own family only**, including the
    collection code
  - group names
- **Never** another family's anything, nor the leaders' medical copy, and a
  parent changes nothing.

**`myFamilyThisSunday()`** (`egbc-events-home.js`) returns plain data for
the main window's Home to draw:
- the family code, its QR as text and **ready drawn** (an SVG)
- each child with their group and whether due, in or gone home
- the collection code once anyone is in
- a child who has left the register is not shown
- nothing medical

**Tests:**
- rules: 16
- browser: `parents` (13), on the real shell's page, including the code on
  the phone being the one the door's scanner reads, the second parent, a
  parent not in the address book, an unverified sign-in seeing nothing, and
  another parent never seeing this family's code

**For the main window (Home):** call `EGBCEventsHome.myFamilyThisSunday()`
and draw it:
- "Show this at the door" with `qrSvg` and `familyCode`
- the children, with "in" or "due"
- **the collection code**, large, once `collectionCode` is set

Load `egbc-events-kids.js` and `egbc-events-qr.js` before
`egbc-events-home.js`.

### F-146 — "Works with under-18s" with many people named: no dead end (after review)
**What it did before:** when the box was first ticked, the rules checked
everyone already named in one save, three at most. An event with four or
more leaders and helpers **could not be ticked at all**. The page said "at
most three can be named when it is first ticked", which left the person
ticking it no way on but removing people. That was a dead end.

**Why the limit exists:** in one save, the rules can only look up a few
records, and each person's check costs two. Measured: two people per save
fits; three does not.

**What it does now:**
- **Ticking is always accepted**, however many are named (up to 20).
- **The page clears everyone in turn, two at a time**, in one click.
  - Each person is checked as they're cleared: in-date checks, or an
    exception.
  - Each one cleared is recorded on the event (`clearedIds`).
  - If a pair is refused, each of the two is tried on their own, so one
    person without checks never holds up the other.
- **Anyone who can't be cleared is named plainly, with the way forward.**
  The event form says, for example: "4 of 5 are cleared. Not yet: Ned New
  (no in-date DBS check or training). The safeguarding lead can record an
  exception with a reason, or they can be taken off this event."
- **On the Safeguarding page:**
  - Each such person is marked "not cleared yet".
  - A master admin or the safeguarding lead gets an "Exception" button on
    their row.
  - "Check again" is there for after someone's checks are brought up to
    date.
- **While anyone isn't cleared:** nobody new can be named unless they're
  cleared in the same save, and the event is still marked as working with
  under-18s.
- **Unticking forgets who was cleared**, so ticking again checks everyone
  afresh.

**Proved:**
- **Rules:** a five-person Kids Film Club in turn (ticked, then two, then
  two more), with Ned refused. Three in one save is refused. Nobody new can
  be named while Ned waits, and removing Ned is accepted.
- **Browser:** Puppet practice with five named, Ned in the middle. Ticking
  is accepted, the four are cleared, and Ned is named. An exception for Ned
  clears him, and the warning goes.
- **5 deliberate breaks**, all caught, including "one person without checks
  holds up the one paired with them".

### F-144 — phone notifications built (NEXT-BRIEF §23): see FINDINGS-notify N-8
- What's built: N-8.
- What the main window is asked for: N-4 (the sending functions) and N-5
  (the service worker, the app, the Menu, and letting parents not in the
  address book into the app).
- The real-phone proof, for Martin: N-7.
- `egbc-notify-core.js` also carries the §24 "checks running out" message,
  so the weekly reminder function (N-4) uses the same words and switch.

### F-147 — Share on WhatsApp for events (launch list item 1)
Uses the main window's `egbc-share.js` and nothing else: one shared helper,
as the brief says. Nothing is ever sent from here. The person sees the
preview, presses Share, and picks the group in WhatsApp themselves.

**Where the button is:**
- **The event's own page** (`signup.html`), beside Add to calendar.
- **The app's event view** (What's on), as "Share on WhatsApp".
- **events-admin's list**, a share icon on each event. This is for Martin's
  weekly posting.
- **An open photo upload link** (events-admin, Photos). Its message tells
  guests that nothing they send is shown until it has been looked at. A
  link that's switched off, full or run out has no Share button.
- **Not on an event that isn't announced yet.** A cancelled one can be
  shared, and says CANCELLED.

**What goes in the message:** the title, when and where, the words in
WhatsApp's markup, then the link to the event's page. The poster goes as a
picture file when the phone can take one. It never says who has signed up.

**The pieces, in `egbc-events.js`:**
- `shareItem` builds the message.
- `share` opens the preview, and fetches `egbc-share.js` the first time if
  the page hasn't loaded it. This is why the app needs no new script tag.
- `plainText` and `safeHtml` read an event's words.

**Two faults found on the way, both fixed:**
- **The app showed an event's words with their tags**, as "<p>A shared
  meal</p>", and the calendar file did the same. Both now show plain text.
- **The event's own page put the words into the page exactly as stored.**
  The editor cleans words when they're saved, but the rules can't check
  HTML, so words written any other way went straight onto a public page.
  - They're now cleaned again when shown: the editor's own tags and
    pictures, and nothing that can run.
  - The cleaning uses a separate document (DOMParser), which runs nothing
    and loads nothing.

**Proved** (`share.test.mjs`, 25 checks):
- the phone gets exactly the previewed words, plus the poster
- a computer gets wa.me with the message ready
- three bad pictures in an event's words never run, on the page, in the
  app or in the share
- the app fetches the helper only when it's needed

**8 deliberate breaks, all caught.**
- At first, the break "a picture keeps its onerror" was **not** caught: my
  bad pictures had no web address, so they were thrown out before that
  check mattered. I added one with a real web address, and it's caught now.

**Not proved: real devices.** This is checklist item 7, and FINDINGS-share
S-002 covers it. The event page should be part of that ten minutes.

### F-148 — REQUESTS for the main window (sharing)
1. **`egbc-share.js` reads HTML in a way that can run it.**
   - **The problem:** `htmlToWhatsApp` puts the HTML into a
     `document.createElement('div')`. In a page's own document, an
     `<img src=… onerror=…>` there runs, even though it's never shown.
   - **How it was shown:** break 3 of F-147 handed it uncleaned words, and
     the bad picture ran.
   - **The fix:** `new DOMParser().parseFromString(html, 'text/html')`
     makes a separate document that runs nothing. `egbc-editor.js` already
     does this.
   - **Who is affected:** my pages clean the words first, so they're safe
     already. Notices and meetings rely on the editor having cleaned them
     when saved.
2. **app.html: bump the version on `egbc-events.js` and
   `egbc-app-whatson.js`**, so phones fetch the new copies. Optionally, also
   load `egbc-share.js` there. Without it, my code fetches it on first
   tap, which works either way.
3. **Checklist item 7 (real devices):** please add the event page's Share
   to the list. It uses the same helper, so it's the same ten minutes.

### F-149 — the index check (launch list item 2): nothing to add
**The question:** the emulator runs any query, with or without a database
index, so a missing index would only show after the switch-over, as "The
query requires an index" on a live page.

**The answer: none of my queries needs an index that isn't already in
`firestore.indexes.json`.**
- **483 queries read**, in 56 files: every file an "Events:" commit has
  touched, except `egbc-auth.js` and `egbc-db.js`.
- **Only one needs a composite index:** What's on's list (who can come,
  from now on, soonest first). It's already in the file, and live since
  8 Oct.
- **Everything else** filters only by "equals" (the site, the day, the
  group, the event), or by one field alone. Firestore serves both from its
  automatic indexes.
- **Where I chose this on purpose:** sorting is done on the page after
  reading, not in the query, so no index is needed.

**The functions I've asked the main window for** (N-4, F-139) were checked
the same way, by reading my specs. Each reads by "equals" or by document
id, so they need nothing either.

**The check stays:** `screenshots/events/index-check.mjs`, in the full run.
- **It reads the code** and applies Firestore's own rule: a query needs a
  composite index when it sorts, or uses a range, on one field and also
  filters or sorts on another.
- **It fails** if any query needs an index the file lacks. It also fails if
  it meets a filter it can't read as part of a query, rather than guess.
- **6 deliberate breaks, all caught:**
  - the What's on index missing
  - the What's on index sorting the wrong way
  - a query sorting by another field
  - a query with a range on another field
  - two forms of a query kept in a variable
- **One of the six is cautious, not strictly needed:** a single range
  filter on its own needs no index, but the check can't be sure, so it
  says so.

**For the main window:** nothing to deploy for me. If you'd like the
same check over your own files, run it with `FILES=a.js,b.html`.

### F-150 — switch-over notes for my areas (launch list item 3), and my eight pages by eye
**The notes:** `SWITCHOVER-events.md`, for Martin, Val, the office and the
safeguarding lead, ready for Step Q to copy into the checklist.
- **Part 1:** what goes live, in what order.
- **Part 2:** two things to do straight after the deploy:
  - give each existing form a Team (F-092)
  - press Save once on Accounts (F-108)
- **Part 3:** the setting up, in order. A site comes first, because Kids
  Church needs one. Safeguarding checks come before leaders are named, so
  nobody is refused on the day.
- **Part 4:** the proofs on real devices.
- **Part 5:** the decisions still open, each with its default. **The DBS and
  training period is a setting, currently 3 years, for the safeguarding
  lead to set.**
- **Part 6:** what does NOT need doing.

**One new question for Martin (3.7):** are all the past sermons on Val's
Spotify show? If they are, the ChurchSuite downloads aren't needed, because
the feed brings in everything the show holds.

**My eight pages at 375px, by eye** (§7d; APP-PARITY part 2 measured them
phone-ready). These are notes only: nothing will change until the main
window's app mode lands.
- **`kids-admin.html`: the clearest "desktop squeezed down".**
  - When a child is opened, their details sit in two narrow columns.
  - The parent's email breaks mid-word ("parent@example.inv / alid").
  - The "May collect" box is cut off ("Parent Syntheti").
  - Its help text runs one or two words a line.
  - **The fix:** at phone width, stack each label above its value.
- **`safeguarding.html`:**
  - The "Works with under-18s" tick has its label squeezed into a thin
    column ("Works / with / under- / 18s").
  - The two settings beside each other are fine.
- **`rooms.html`:** in the day chart, room names are cut ("Test Ban…"). The
  chart scrolls inside its own box, which is meant, but the names should
  show whole.
- **`maintenance.html`:** in Close a room, the "To (the last day)" date box
  pokes past the card's edge.
- **`bookings-admin.html`:**
  - The requester's email breaks mid-word.
  - Only the Waiting tab was seen. Day view, Setup sheet and Invoices still
    need looking at in app mode.
- **`whatson.html`, `kids-checkin.html` and `groups.html`:** nothing looked
  squeezed.

**For the main window (APP-DESIGN-BRIEF §7e):** rebuilding app.html from the
mock-up's code will change how the shell draws. My app screens (What's on,
Listen, Kids Church Today, Jobs, Bookings) draw through the shell's helpers
(`row`, `sec`, `next`, `card`, `head`, `empty`, `ic`, `esc`) and mount with
`EGBCAppEvents.mountAll`.
- If those names or what they return change, please say, and I'll move my
  screens across.
- My tests build their test copy of the app from app.html, so they'll show
  what breaks.

### F-151 — the missing past sermons (Martin, 11 Oct)
**Martin:** some past sermons are missing from Val's Spotify show, so the
ChurchSuite downloads are needed after all. This is step 4 of 3.7 in
`SWITCHOVER-events.md`.
- **When:** once Val's feed address is in and the feed has come in.
- **Matching:** the feed against the downloads, on **playing time**. The
  MP3 names and the titles inside the files aren't reliable, and file size
  changes when Spotify re-saves the audio.
- **Martin sees the list first:** the ones with no match, and any that are
  unsure.
- **Then only those are uploaded,** as backup audio, with title, speaker,
  date and series.
- **Not started.** It waits for the feed address (A-L2).

### F-152 — REQUEST for the events window: Running things ▸ Bookings tells a master admin "You are not on one" (Martin, 11 Oct)

**What Martin saw.** Walking the live phone app as himself — a master admin
— Running things ▸ Bookings says:

> Room bookings are looked after by each site's office. You are not on one.

That sentence is wrong for him twice over. He *is* the office of every site:
`bookings-admin.html` lets `isAdmin()` see all of them, and
`EGBCEventsHome.officeQueue()` already agrees — `mine` is every active site
when `isAdmin()` is true (`egbc-events-home.js:131`). What has actually
happened is that **there are no sites in the database yet**, so `sites` is
empty, `mine` is empty, and `egbc-app-office.js:63` reads an empty list as
"you are not an office".

**What Martin asked for**, in his words:

- a master admin with **no sites yet**: *"No sites or rooms set up yet — add
  them in Places on a computer"*
- a master admin with sites: **every site's requests** (which the queue
  already returns — nothing to change below the screen)
- anybody else who is on no site's office: the sentence you have now, which
  is right for them

**Why it is yours and not mine.** The one line that needs changing is
`egbc-app-office.js:63`, which is your file. I have not touched it. The data
underneath is already right, so this is a wording-and-branch change on that
line, not a change to `officeQueue()`.

**Suggested shape** (yours to take or leave):

```js
if (!Q.sites.length) {
  var admin = !!(EGBCAuth.isAdmin && EGBCAuth.isAdmin());
  return out + '<div class="card" style="padding:14px" data-o="none"><p style="margin:0">'
    + (admin
        ? 'No sites or rooms set up yet — add them in Places on a computer.'
        : 'Room bookings are looked after by each site\'s office. You are not on one.')
    + '</p></div>';
}
```

**A test that can fail**, if you want one: a master admin with no `sites`
documents must see the Places sentence, and the same person with one active
site must see that site's requests. The first of those is the live state
today, which is how it reached Martin.

### F-153 — six rules tests are failing on main, all in kids check-in and paging

Found while running the suite for an unrelated change, and **checked against
a clean checkout before saying so**: these six fail on `main` with no edits
of mine in the tree, so they are not from the Core Team cover (F-154) or the
calendar work.

```
FAIL  the desk checks Cat in, with her roll-call copy, in one write   (expected allow)
FAIL  but not of a child who has not come this morning                (expected deny)
FAIL  Juniors' leader pages Cat's parent: "Q7P2, please come to Juniors" (expected allow)
FAIL  THE CONTRACT: the projection computer (a worship admin) reads the
      active pages for the site, exactly these fields, a code and no name (expected allow)
FAIL  the Session Leader pages too, this morning                      (expected allow)
FAIL  the leader presses "Done": it is cleared, at server time        (expected allow)
```

Baseline: **1013/1019 on a clean `main`.** With my changes and the nine new
Core Team tests it is 1022/1028 — the same six.

One of them is an "expected deny" that is now allowing, which is the one I
would look at first. I have not touched these rules or these tests.

### F-154 — Core Team covers Worship & AV, in the rules as well as the pages

Your `2cc0e0ad` made `EGBCAuth.inTeam` treat Core Team as Worship, AV and
Choir. The rules now say the same thing, so a page that opens is not a page
whose data is then refused:

- `firestore.rules`: one list, `coreCovers()`, behind `myTeams()`. Both
  `onTeam(team)` and a new `onAnyTeam(teams)` read it. The rota write used
  a bare `me().teams.hasAny()` of its own, which would have let Core Team
  **read** the Service Planner and refused them **saving** it; it goes
  through `onAnyTeam` now.
- Nine rules tests, with a Core-Team-only synthetic person (`u_core`) -
  `martin` is Core Team but also AV Team and a master admin, so he proves
  nothing here. Deliberate break: without the cover, four of them fail.
- `egbc-app.js` `spacesFor()` asks `EGBCAuth.inTeam`, so a Core Team member
  gets the Worship & AV space in the phone app.
- `egbc-menu.js` no longer carries its own copy of the list: `'Core Team'`
  has come out of the Worship & AV node's `team:` and its `onTeam()` asks
  `EGBCAuth.inTeam`.
- `tests/check-core-covers-worship.mjs` walks **every** page carrying
  `data-team`, twice - as a master admin viewing as Core Team, and as
  somebody whose only team is Core Team. The page list is read off the
  pages, so one added later is walked without anybody remembering.

Nothing of yours was changed.

### F-153 answered — the six failing tests: a fixed date in my test, not a broken rule
**Why a bisect would find nothing:** no commit broke these. Yesterday's
passing version of the rules and tests, run today, fails the same six.

**The cause: my own test** (K2 Sunday check-in, a8859a0d, 8 Oct).
- **The fixed date:** that section checks Cat and Dan in and out on a
  fixed date, `'2026-10-11'`.
- **The clash:** the morning and paging sections after it use the same
  record names with **today's** date. On 11 October the two collided.
- **What that did:**
  - Cat's check-in already existed, checked out with a different code, so
    checking her in again was refused. Correctly: a check-in can't be made
    twice. Her pages were refused too, because the code didn't match.
  - **The expected-deny:** Dan really did have a check-in dated today in
    the test data. So the rules rightly let the Session Leader see his
    medical details, while the test claimed he hadn't come.
- **No rule changed.** The test was genuinely wrong.

**The fix:**
- That section now uses a date a week ago, which can never be today.
- A guard stops the run if it ever does use today.

**Rules: 1028/1028.**

**3 deliberate breaks, all caught:**
- **The one that matters:** the Session Leader sees any child's medical
  details, come or not. Caught: "not of a child who has not come this
  morning".
- The Session Leader keeps access after the morning has closed. Caught.
- The section put back on today's date. All six failures return, so the
  original fault shows on any day, not only on 11 October.

**Checked:** the file's other fixed dates (bookings and headcounts in
November and December) share no record names with anything dated today, so
they can't collide this way.

### F-155 — `email_assets/` had no Storage rule, so no church email could carry a picture

Found on 11 Oct 2026 while making the rules agree with EmailBuilder2's door
(Martin: "ANYONE on Core Team, as on the old portal"), and worth recording
because of **how** it was found: nobody looked at Storage for this, the
Firestore side was the job. It only came up because "whatever it reads and
writes" was taken literally.

`EmailBuilder2.html` and `CoreTeamApp.html` both upload to
`email_assets/…`. That path appeared **nowhere** in `storage.rules`, so it
fell to the closed catch-all at the bottom — `allow read, write: if false`.
Every picture upload from both pages was refused, for a leader, for a master
admin, for everybody. Nothing shouted: the page simply could not add a
picture.

Now: read open (the picture ends up in somebody's inbox, where there is no
sign-in to consult — the same reasoning as `banners/`), write for Core Team
or a master admin, 20MB, images only, no delete (old emails still point at
it). Nine tests in `storage-rules.test.mjs`, with a Core-Team-only person —
`martin` there is a master admin and would have passed without the Core
clause. Two deliberate breaks: remove the rule, three fail; remove the Core
clause, one fails.

**Neither page is yours and nothing of yours changed** — this is recorded
here because the same question is worth asking of every path the events
window's pages write to. A path with no rule does not announce itself.
### F-152 answered — Bookings with no sites yet
**Changed:** `egbc-app-office.js`, plus one count in `officeQueue()`
(`allSites`).

**What each person now sees:**
- **Can see bookings, and there are no sites at all yet:** "No sites or
  rooms set up yet — add them in Places on a computer." This covers an admin
  (Martin included), the Church office group, a one-off tick, and a site's
  bookings admin.
- **Has the Bookings tab but isn't a bookings admin of any site,** for
  example someone in the Church office group: "You are not yet a bookings
  admin of any site. A master admin adds you in Places, under 'Who
  approves'."
  - **This is a third case, beyond what was asked.** The rules let only
    admins and a site's bookings admins read its bookings. The office group
    gives the tab but no reading rights.
  - So Val, if she's in the group but not yet a bookings admin, would
    otherwise have been told "You are not on one" too.
- **Anybody else:** "You are not on one", as before.
- **With a site:** Martin sees its requests, unchanged.

**Proved:** `office-nosites.test.mjs`, 10 checks, through the real shell at
375px. It covers Martin and Val with no sites, then both with a site, and
asks the decision directly about someone on no office.

**3 deliberate breaks, all caught:**
- **The one that matters:** the old behaviour, where an empty list always
  reads "not on one".
- The office group forgotten.
- Everybody getting the Places sentence.

### F-156 — the public hire pages: the hub's bar and Menu when signed in (Martin, 11 Oct)
**Martin:** "the drop down menu disappears on some pages". The four pages
were `hire.html`, `room.html`, `book.html` and `my-booking.html`.

**The fix is in one place:** `EGBCChurch.header()`, which draws the public
header on all four pages.

**Signed in:**
- The page loads the standard `egbc-shell.js`, with its top bar, Hub button
  and Menu, like every other page.
- The public header's logo, name and "Back to the hub" step back, so there
  is one bar, not two.
- "Back to all rooms" stays where the page has it.

**Signed out:**
- The shell is never loaded, so the page is exactly as before.
- There is no hub bar, no Menu and no Hub button. Each of those would lead
  a member of the public to the hub's sign-in.
- There is no sign-in prompt, and the visitor is never redirected.

**Why it's safe:** the shell is added only after the browser reports a
signed-in person. It then uses `EGBCAuth.optional()`, which never
redirects, so a public page can't force a sign-in.

**Proved:** `public-menu.test.mjs`, 82 checks: all four pages, signed in and
signed out, at a computer's width and at 375px.
- **Signed in:**
  - the bar and Menu are there
  - the Menu opens and lists pages
  - the page still works
  - one bar, not two
  - nothing scrolls sideways
- **Signed out:**
  - the page works
  - the public header is there
  - no bar, Menu, Hub link or sign-in prompt
  - still on the page
  - nothing scrolls sideways

**`r3-bookings.test.mjs` updated:** its "Back to the hub" check now checks
for the hub's bar and Menu instead. That link was replaced on purpose.

**3 deliberate breaks, all caught:**
- **The one that matters:** the bar and Menu for everyone. Caught on every
  signed-out page.
- Back to how it was: no Menu when signed in.
- Two bars at once.

### Answering cc8eb586 — the shared scratch file, and the storage run

**The storage run is green: 101/101**, including the three sermon-audio
checks (`the person named uploads a sermon's audio`, `only for a sermon
that exists`, `a sermon's audio is never deleted from a page`). Run just
now against the pushed rules.

**On `/tmp/egbc-run.txt`:** nothing in my window writes there, and I can
find no script of mine that ever has — I grepped the repo, my scratchpad
and both working copies. The file as it stands this afternoon holds an
**index-check** summary ("56 files, 483 queries read … Every query that
needs an index has one"), which is yours, not mine.

**Two things about the fragment you saw, offered as facts not as a
defence.** My storage suite has **101** checks, not 92, and has had 101
since the `email_assets` rule went in this morning (92 before that). So
"57/92" is not a shape my run produces today, and was not one yesterday
either — it was 92/92 green.

**None of which makes the hazard less real**, so I have made it a standing
rule on my side: scratch output goes in the session's own scratchpad
directory, with a distinct name per run, never a shared path. If you can
see what wrote it — a timestamp, a surrounding line — send it and I will
chase it properly rather than guess.

---

### F-157 — REQUEST for the events window: "How to pay" on an invoice should default to the church's giving setting (Martin, 12 Oct)

**What has just been built on this side.** Martin had the church's bank
details ready and asked for them to be stored **once**, never typed twice.
They now live in a single document, `churchSettings/giving`:

| field | what it is |
|---|---|
| `accountName` | the name on the account |
| `sortCode` | as somebody would write it on a form |
| `accountNumber` | |
| `reference` | what to put in the reference box, e.g. their own name |
| `giftAid` | whether to mention Gift Aid at all |
| `giftAidUrl` | where the declaration form lives (may be empty) |
| `note` | one optional line, shown under the details |

It is edited on `church-settings.html`, by a **master admin or the Church
office** — deliberately not every admin, because a Kids Church admin has no
business changing where the church's money goes. Read it with
`EGBCChurch.giving()` (a Promise) and ask `EGBCChurch.givingReady()` whether
there is anything worth drawing. Both are in `egbc-church.js`, which your
pages already load.

**It is readable only when signed in.** `details` stays world-readable
because the login page and the public hire pages take the church's name from
it; `giving` is gated on `active()`. One `match` block decides both — adding
a second on that path would OR them and put the bank details back on the
public side.

**The request.** `egbc-events-money.js:203` offers *"How to pay (printed on
invoices)"* as a free-text box, `settings/accounts.payText`, placeholder
"Bank transfer to …". Today the office types the church's bank details into
it by hand. That is the second copy, and a second copy is how two sets of
numbers end up disagreeing — the one on the invoice being the stale one.

Could `payText` **default to** the giving setting: when `payText` is empty,
compose the line from `EGBCChurch.giving()` rather than printing nothing,
leaving the box as an override for anything a room-hire invoice needs that a
member giving by standing order does not?

**Two things to be careful of, from building the other end:**

- **An invoice may be read by somebody who has never signed in.** If any
  invoice is rendered outside a signed-in page — a PDF built by a function,
  say — `giving` will be refused there and the compose must fall back to
  whatever `payText` holds rather than printing an empty "How to pay".
  Worth checking which it is before wiring it up; I have not opened your
  PDF path and am not asserting either way.
- **Nothing is seeded.** Until Val fills the setting in, every field is
  blank, so `givingReady()` is the gate, not the presence of the document.

Entirely your call whether and when — nothing on this side waits on it.

---

### F-158 — the bookings day view breaks DESIGN.md, and it only shows when there are bookings (12 Oct)

`check-style-every-screen.mjs` reports **10 problems on `bookings-admin.html`,
tab: day view**, and none anywhere else in the suite:

```
bookings-admin.html
  tab: day view           10
        button "←" emoji
        span "07:00" 11px
```

Two things, both in your area:

- **`bookings-admin.html:670`** draws the day stepper as
  `<button class="btn sec" id="d-prev">&larr;</button>` and `&rarr;`.
  DESIGN.md allows no emoji or dingbats in the interface — Lucide only —
  and the check counts U+2190/U+2192 among them. `chevron-left` and
  `chevron-right` are what the rest of the suite uses for this.
- **the quarter-hour labels down the day grid** ("07:00" and the rest)
  are **11px**. DESIGN.md's floor is 12px.

**WHY IT HAS NOT BEEN REPORTED BEFORE, which is the part worth knowing.**
The day view draws nothing without rooms and bookings in the database.
The style check ran green twice this morning on a freshly restarted
emulator — because that screen was empty. It only turned red once a full
suite run had seeded rooms. So this is not a regression today; it is a
screen that has never been measured with anything on it.

That is worth more than the two fixes: **a check that walks a screen with
no data on it is not walking the screen.** Any other view in the bookings
area that is empty on a bare emulator has the same hole.

**Not touched from this side** — `bookings-admin.html` is yours, and the
standing rule is that your files are yours. Say if you would rather I did
it; it is a two-line change.

### F-159 — REQUEST from the main window: app mode on notifications.html (N-5)
The app's Me tab now has **Notifications**, which opens `notifications.html`
the way every other row does (`open:` with `?app=1`). To wear the app's
header and tab bar rather than the website's, the page needs the one line
the other eight of your pages already carry:

    <script src="egbc-appmode.js?v=202610112000"></script>

next to `egbc-shell.js` in the `<head>`. Nothing else on the page changes.

Until it lands, `tests/check-app-mode.mjs` lists the page under
**WAITING**, printed on every run. When you add the line, please take the
page off that list (one line, `WAITING` near the top), and the check will
then hold it to the same standard as the rest.

Also for you, no action needed: N-4 is built (FINDINGS-app A-077). Your
`egbc-notify-core.js` and `egbc-events-safeguarding.js` are copied into
`functions/` as `.cjs`, because functions can only deploy their own
folder. `check-notify-send.mjs` fails if either copy differs from the
original, so **if you change either file, copy it over the `.cjs` too.**

### F-160 — item 4: phone notifications checked end to end against N-4 and N-5
**What was run:** my pages (`notifications.html`, `egbc-notify.js`), the
main window's **real** functions (codebase hub, in the functions emulator),
the emulator's push and email outboxes, and my service worker
(`egbc-notify-sw.js`) deciding what the phone shows.
- **The new test:** `notify-e2e.test.mjs`, **34 checks**, now in my full
  run.
- **The functions emulator:** added to `firebase.events.json` on 5102,
  which is the port `egbc-auth.js` already calls from 5601. It starts only
  when a run names `functions`.
- **The two timed reminders** (rota, checks) are run straight from
  `functions/notify.js` at chosen times, because a timer can't be fired on
  the emulator.

**Proved:**
- **Call a parent:**
  - Jo (the group's leader) presses it. The parent's phone shows "Please
    come to Juniors / Collection code Q7P2". The second parent, who has no
    phone, is emailed the same words.
  - **The child's name is nowhere**: not in the push, the email or the log.
  - The message stays on screen until it's dealt with, and is never quiet,
    even at 23:30.
  - A dead phone is removed.
  - A second press inside two minutes sends nothing, and says so.
  - Someone who leads nothing is refused.
- **Quiet hours:** a rota reminder at 22:00 arrives, silently.
- **The switches:**
  - a message turned off on the page is not sent, and not emailed either
  - no phone means an email instead, except booking news (the page emails
    those already)
- **Every launch message, with its own words:**
  - the test message
  - the rota ("You are serving tomorrow", the role and the service)
  - booking approved
  - maintenance job (**no photo**, and it opens that job)
  - urgent notice (as plain text, never quiet)
  - checks running out (plus one email to the site's safeguarding lead)
- **Once only:** timers and triggers that run twice send once. An edit that
  isn't a status change, or edits an urgent notice, sends nothing.
- **A tap** opens the hub, inside its own scope.

**7 deliberate breaks, all caught.**
- **The main window's files were never edited, not even for a moment.**
  The four function-side breaks ran against a scratch copy of `functions/`
  in my scratchpad.
- **Function side:**
  - **the one that matters:** the child's name put on the phone
  - anybody may call
  - no two-minute gap
  - a dead phone kept
- **My files:**
  - the service worker ignores quiet hours
  - calling a parent slips off the screen by itself
  - a switch turned off isn't saved
- At first the test failed 5 checks, all mistakes in the test itself:
  - **"name nowhere":** it matched my invented record id `kc_cat…` in the
    hidden tag. Real ids are random.
  - **two "tapped, it opens" checks:** they read the result too early.
  - **two email checks:** they relied on the outbox's order, which the
    database doesn't keep.

**Checked by reading (functions/notify.js against my N-4 spec):**
- The message is data-only, which my service worker expects.
- Calls are urgent, and the push has a one-hour lifetime.
- Dead phones are removed.
- The log holds no token and no address.
- Only verified parent addresses are used.
- The two-minute gate is decided in one transaction.
- "Who may call a parent" matches the rules' paging (`kidsLead`, which
  includes master admins and the safeguarding lead).
- **The hidden tag:** it carries the check-in's id, which includes the
  child's record id. Both places that create children use random ids
  (`'kc_' + 14 random characters`), so it can't hold a name.
- **The copies:** both of my files copied into `functions/` match the
  originals exactly.

**Not done, as asked:** the real-phone proof (N-7). It needs N-4 deployed,
which Martin does with the main window's steps.

**Found, not mine to fix:**
1. **For the main window: the rota reminder never sends an arrival time.**
   - My message has room for one (`arrive`), but `runRotaReminders` sends
     only the roles and "service, start time".
   - So it says "Bass · Morning Service, 10:30", not when to arrive.
   - Fine for launch. If the rota holds an arrival time, pass it as
     `arrive`.
2. **For the main window: take `notifications.html` off the WAITING list**
   in `tests/check-app-mode.mjs`. F-159's line is in (5424b2b0), so the
   check can now hold the page to the same standard.

### F-161 — invoices' "How to pay" comes from the one giving setting
**Asked:** room-hire invoices' "How to pay" should default to the church's
bank details, the one giving setting (`EGBCChurch.giving()`), with the old
Accounts box kept as an override.

**How it works:**
- **When an invoice is issued**, `EGBCAccounts.payWords()` decides the
  words:
  1. **Words typed in Accounts' "How to pay" box**, if there are any. The
     override stays.
  2. **Otherwise the church's bank details:** "Please pay by bank transfer
     to …, sort code …, account number …".
  3. **Otherwise nothing,** and the invoice says only when to pay, as
     before.
- **The words are kept on the invoice and on each booking's invoice
  summary** (`payText`).
  - The giving setting is signed-in only, so the hirer's own booking page,
    which is signed out, could never read it. It reads the kept words
    instead.
  - An invoice keeps the words it was sent with if the details change
    later.
- **The invoice email prints the kept words.** An invoice issued before
  this falls back to the Accounts box, as before.
- **The hirer's booking page shows them** under the invoice. It now also
  says "quoting INV-…".
- **The Accounts box** says that leaving it empty uses the church's bank
  details.
- **No rules change.** Invoices aren't limited to a fixed list of fields,
  and the office may already write a booking's invoice summary.
- **Who can issue with it:** anyone signed in may read the giving setting,
  so every office person who issues invoices can.

**Worth knowing:** the bank details were kept to signed-in people. Now they
are also on each invoiced booking, which anyone with that booking's
private link (the hirer) can open. That's what copying them onto the
invoice means, and a hirer needs them to pay.

**Proved:** `c5-stage3.test.mjs`, now 43 checks (6 new):
- with nothing in Accounts, the bank details, on the invoice, its bookings
  and the email
- with words in Accounts, those instead, from the next invoice on
- the first invoice keeps its words
- signed out, each hirer sees their own invoice's words

**5 deliberate breaks, all caught:**
- **The one that matters:** back to how it was, where an invoice says
  nothing about how to pay.
- The override ignored.
- The words not kept on the booking.
- The email using today's box rather than the invoice's words.
- The hirer's page not showing them.

**Switch-over notes updated:** bank details are typed once, in Church
details. The Accounts box is only for different wording.

### F-162 — F-150's phone fixes, in app mode at 375px
**Each fix, judged by eye** in app mode at 375px, with a check of its own
(`phone-fixes.test.mjs`, 24 checks, now in the full run):
- **`kids-admin.html`:** an opened child's details now put each label
  above its value, at full width.
  - The parent's email is on one line.
  - "May collect" shows everyone ("Parent Synthetic, Grandma Invented"),
    not "Parent Syntheti".
  - Long words break only when they can't fit a line of their own (was:
    anywhere).
- **`safeguarding.html`:** the "Works with under-18s" words are one span
  beside the box. Before, the bold words and the rest became two squeezed
  flex columns ("Works / with / under- / 18s").
- **`rooms.html`, and Room bookings' Day view:** the day chart puts each
  room's name on its own line above its bar, whole.
  - The name stays in view while the chart scrolls sideways. That scroll is
    kept on purpose, so the quarter-hour cells stay big enough to tap.
  - This is in `egbc-events-bookings.js`, so `room.html` and `book.html`
    get it too.
- **`maintenance.html`:** Close a room's two date columns may now shrink
  (`minmax(0,1fr)`), so the "To" box no longer pokes past the card.
- **`bookings-admin.html`:** a booking's details stack the same way as
  kids-admin, so the requester's email is on one line, not broken
  mid-word. Every tab was walked in app mode:
  - Waiting, Coming up, Day view, Setup sheet, Invoices, Hirers, Accounts,
    Past and cancelled
  - nothing scrolls sideways, and no words run off the screen
  - Coming up had the same narrow columns, and the same fix covers it
- **Every page and tab** also passes the main window's measure (APP-PARITY):
  no sideways scroll, and no words past the right edge outside a box that
  scrolls on purpose. **That measure passed on the unfixed pages too**,
  which is why each fault has a check of its own.

**Before and after, for Martin:** `screenshots/events/phone-compare-*-375.png`
puts the two side by side, one image per page:
- kids-admin
- safeguarding
- rooms
- maintenance
- bookings: Waiting, Day view and Coming up

The single pictures are `phone-<page>-before-375.png` and
`phone-<page>-after-375.png`.

**Proved:**
- **Before:** the test on the old code fails on exactly the faults F-150
  named.
- **After:** 24/24.
- **5 deliberate breaks**, each fix undone on its own, all caught.
- **Two of my first breaks were not caught, and I said so:**
  - **maintenance:** a date-box rule I'd added was redundant. The real fix
    is the shrinkable columns, so I removed the rule and pointed the break
    at the columns.
  - **bookings-admin:** the columns could come back unnoticed, because the
    email no longer broke anyway. I added the layout check.

**Test note (F-073 again):** after a few pages in one tab, the next page
said "Could not check your access". The browser had run out of connections
to the local test database, because each page's live connection lingers. So
the test opens each page in a fresh tab.
- Live, the database shares one connection, so a phone doesn't meet this.
- I first blamed a scroll line in the test, and that was wrong. Capturing
  the screen on failure showed the real cause.

**For the main window:** `app.html` loads `egbc-events-bookings.js?v=202610101200`.
Please bump it to `202610131800`, so the app's own Book a room and Day view
draw the room names whole on phones that have the old copy.

### F-163 — Watch: "Listen & Watch", the YouTube channel, full services, the live link (NEXT-BRIEF §24 item 5)
Feature name **`watch`** (EGBCChurch.uses). Built for any church: the
channel and the live card's defaults are settings (`watchShow/settings`).
Nothing is EGBC's in code.

**What's built:**
- **`egbc-watch.js`:** the part that decides. It touches no database and
  no network, so the page, the app, the unit test and the function all use
  it.
  - It reads YouTube's channel feed. A video is known by its YouTube id, at
    `videos/yt_<id>`, so a second read never makes a copy, and "hidden" is
    the office's choice and never touched by a read.
  - It turns any usual YouTube link into its video id.
  - It works out the live card's times from the church's settings, in
    London time.
  - It says whether the card shows "Watch live", "Watch again", or
    nothing.
- **`watch-admin.html`, "Watch":** for the people who look after sermons
  (`sermonShow/access`, and master admins), linked from Sermons.
  - **This week's live link:** "show until" starts at the church's default
    (EGBC: the coming Sunday at 4pm), then it disappears or becomes "Watch
    again" until a second date. "Take it down" removes it. It says plainly
    that it's for signed-in people only, and that an unlisted link can be
    passed on.
  - **Full services:** unlisted YouTube links, for everyone signed in or
    for church members only. It explains that a private video can't be
    shared this way.
  - **The channel:** its id (as a setting), what the last read found, and
    Hide or Show for each video.
  - **The live card's defaults:** the day and time it goes, then disappear
    or "Watch again" for a number of days.
- **The app (`egbc-app-listen.js`):** "Listen & Watch", still one tab.
  - A Listen / Watch switch at the top, with the "Watch live" or "Watch
    again" card above both while the link is showing.
  - Watch lists the full services, then the channel's newest videos
    (never a hidden one). Each plays in place, in YouTube's no-cookie
    player.
  - Switched off, it's plain "Listen", as before.
  - `egbc-watch.js` is fetched the first time it's needed, so `app.html`
    needs no new script tag.
- **Home:** `EGBCEventsHome.watchLive(now?)` gives the main window's Home
  card `{ state: 'live' | 'again', title, videoId, embed, until }`, or
  `null`. It gives `null` signed out, outside the times, or with Watch
  switched off.
- **The rules** (in the events section):
  - **The live link and the members' full services are never readable
    signed out.**
  - A church-members-only service is for church members (and the office).
  - No page can make a channel video. The office may only hide or show
    one.
  - Links must be YouTube's, and times must be in order ("Watch again"
    ends after the card does).
  - The church's settings are checked: a channel id starts UC, a day is
    0 to 6.

**Proved:**
- `watch-unit.test.mjs`: 22 checks, including a second read making no
  copies, Sunday-morning versus Sunday-evening, and the clocks going back.
- `watch.test.mjs`: 29 checks, the office's page and the real app shell at
  375px.
- **Rules:** 31 new checks. The full file passes, 1141.
- **8 deliberate breaks, all caught:**
  - **the one that matters:** the live link readable signed out (caught
    by the browser test and by the rules tests)
  - a members' service readable signed out
  - a second read making copies
  - a link added on Sunday morning running to next Sunday
  - the card ignoring show-until
  - a hidden video shown
  - the card showing with Watch switched off
- **Found by my own tests, and fixed:**
  - With Watch switched off, the live card still showed.
  - At 375px, the video player came out one line tall. The app's content
    is a grid, and a 16:9 video sized by its own width counted as no
    height. Now a plain 16:9 box holds it, and a check makes sure the card
    holds the whole player.

### F-164 — REQUESTS for the main window (Watch)
1. **The hourly read of the channel (codebase hub).** Like the sermon feed
   (F-139, still to be built), so one scheduled function could do both:
   - Read `watchShow/settings.channelId`. If it's empty, do nothing.
   - Fetch `https://www.youtube.com/feeds/videos.xml?channel_id=<id>`
     (`EGBCWatch.feedUrl`).
   - Call `EGBCWatch.sync(store, text, new Date())`, where the store is:
     - `get(id)` and `create(id, data)` / `update(id, data)` on
       `videos/<id>`
     - `status(data)` on `watchShow/feedStatus`
   - Copy `egbc-watch.js` into `functions/` as `watch-core.cjs`, with the
     same copy check as the other two.
   - **Never** read `watchShow/live`, or write anything but `videos/yt_*`
     and `watchShow/feedStatus`.
2. **Home: the "Watch live" card** for signed-in people, from
   `EGBCEventsHome.watchLive()`.
   - "Watch live" or "Watch again", with the title.
   - A tap opens Me ▸ Listen & Watch, which plays it.
3. **The tab's name:** "Listen" becomes **"Listen & Watch"** when
   `EGBCChurch.uses('watch')`. The label is the shell's.
4. **The Menu:** "Watch" (`watch-admin.html`) beside "Sermons", for master
   admins and the people in `sermonShow/access`.
5. **`app.html`:** bump `egbc-app-listen.js` and `egbc-events-home.js`.
6. **"What does your church use?" (item 14):** add `watch` to its list,
   under Sundays and teams, or Communication.

**Note (13 Oct), `notify-e2e.test.mjs`:** the main window's master switch
for notifications (A-081, eb27ade9) is off by default, so my end-to-end test
now proves "switched off: calling a parent is refused in words, and nothing
is sent". It then switches it on in the test database for the rest, 35/35.

### F-164 added (Martin, 14 Oct) — the live service on the front page ON THE DAY, phone and desktop
Martin: *"when there is a streamed service scheduled it should go on the
front page of the app on both phone and desktop on that day"*.

**Built (events window):**
- **When a new live link shows:** by default, on the day of the service,
  from a "shown from" time to the "until" time. It's a church setting,
  `watchShow/settings.fromTime`, and EGBC's is from the start of the
  Sunday until 4pm.
- **Added on a Wednesday,** it waits for Sunday. **Added on the Sunday
  morning,** it shows at once.
- **The Watch page:** "The service is on [day], shown from [time], until
  [time]". The person adding the link can still change it for one week.
- **The rules:** "shown from" must come before "until".
- **Tests:** unit 25, browser 30, rules 1143.
  - The break "show from whenever it's saved" is caught (4 checks).

**For the main window, added to F-164 item 2:** the "Watch live" card goes
on the front page on the **desktop** too, as well as the app's Home.
- That means `hub.html`'s home, from the same
  `EGBCEventsHome.watchLive()`, for signed-in people only.
- `hub.html` would need to load `egbc-events-home.js`.
- The helper is null outside the day's times, so the card appears and goes
  by itself.

**Main window, 14 Oct: F-164 items 1 to 5 done.**
1. `feedSync` (codebase hub), every 60 minutes: the sermon podcast feed
   (`sermonShow/feed.url`, F-139) and the channel feed, through your own
   `sync()`s. Copies `functions/watch-core.cjs` and
   `functions/sermons-feed.cjs` have drift checks. A part switched off in
   `churchSettings/features` (`sermons`, `watch`) is not fetched; a failed
   fetch writes only its feedStatus. Never touches `watchShow/live` or deletes
   anything. `tests/check-feeds.mjs`, 17/17. Not live until the reviewing
   window deploys functions:hub.
2. "Watch live" / "Watch again" on the app's Home (opens Me > Listen & Watch)
   and on `hub.html`'s front page with the player in it; re-checked every five
   minutes. Neither waits on anything else.
3. "Listen & Watch" when `uses('watch')`.
4. Menu "Watch", before "What's on" (there is no "Sermons" entry yet to sit
   beside): master admins and `sermonShow/access` only. egbc-auth.js reads
   `sermonShow/access` once with the profile (`EGBCAuth.isSermonsAdmin()`).
5. Bumped. `tests/check-watch-meet.mjs`, 24/24.
6. Comes with item 14.

### F-165 — the public What's on: public / members only / NOT LISTED, and the website's two embeds (NEXT-BRIEF §24 item 13)
Feature name **`publicWhatson`** (EGBCChurch.uses).

**What's built:**
- **"Who can come" on an event gains "Not listed"** (only the organisers
  and admins see it). It's the first choice, and **the default for a new
  event**. Until now a new event started as "Everyone", which is exactly
  the accident Martin wants to prevent.
  - "Everyone" now says "(public, on the church website too)".
  - Small groups and forms keep their own four choices (`E.WHO`). Events
    use `E.EVENT_WHO`.
- **How "not listed" works:** a not-listed event's `audience` is
  `['unlisted']`, which no reader's list ever asks for. So it's in nobody's
  What's on, the app, or the website's embeds, not even a master admin's.
  - events-admin alone asks for it, and shows it with a "Not listed"
    flag.
  - The existing event rule (`canSeeEvent`, the main window's) already
    lets only admins read it, and refuses "public" unless the event says
    Everyone. **No rule needed changing.** The new rules tests prove it.
- **`whatson-embed.html`:** the two views that replace the website's
  ChurchSuite iframes.
  - `whatson-embed.html` is a "coming up" list.
  - `?view=month` is a month calendar with the months before and after.
    On a phone it's a list of the month's days instead of seven columns.
  - Options: `&accent=` for the website's colour, `&limit=` for the list's
    length.
  - **It asks the database for public events only, and checks again on
    the page**, so a visitor who happens to be signed in to the hub in the
    same browser still sees only the public list.
  - It never signs anyone in and draws no hub bar or Menu.
  - Each event opens its own public page in a new tab.
  - It tells a parent page its height (`postMessage`) for websites that
    size the iframe to fit.
- **events-admin:** a fold-out "On the church website" card with the two
  `<iframe>` codes to paste in, each with a Copy button.

**Proved:**
- `public-whatson.test.mjs`: 24 checks, at a computer's width and 375px,
  signed out, as an attender, and as a master admin.
- **Rules:** 10 new checks, 1153 in all.
- **6 deliberate breaks, all caught:**
  - **the one that matters:** a new event starts as "Everyone" again
  - the embed asking for more than public events
  - "not listed" saved as attenders
  - events-admin unable to find not-listed events
  - the month squeezed at 375px
  - the embed showing events while switched off

**Existing events are unchanged.** Any already marked "Everyone" will show
on the website. The switch-over notes ask the office to check them first.

**For the main window:** add `publicWhatson` to "What does your church
use?", under Events and rooms.

### F-166 — Prayer requests and answers to prayer (NEXT-BRIEF §24 item 11)
Feature name **`prayer`**. The page is `prayer.html`, and it works in app
mode. **No server function is needed.**

**A request:**
- Anyone in the address book can ask, at any time.
- "Who may see it": **the pastoral team only** (the first choice), or the
  pastoral team and the church's **prayer team**.
  - The prayer team is a church setting (`prayerSettings/main.prayerTeam`,
    a team or group's name), set on the page by a master admin. A church
    with none simply doesn't offer that choice.
- The person's name goes with it, so they can be prayed for by name.
- The page says "Thank you. Your request has been passed on".

**"My requests":**
- The person sees their own, and marks one answered with a few words.
- They can share that answer with the church, with or without their name.
  **The shared answer carries only the answer, never the request.**
- They can take a request back.

**Answers to prayer:** read by everyone signed in. The pastoral team can
hide one.

**Who sees requests:**
- the pastoral team: all of them
- the prayer team: only those shared with it
- anyone else: none

The page finds this out by asking the database, so it can never disagree
with the rules.

**A big "Speak" button** (`egbc-speak.js`, shared so other forms can use
it):
- It uses the phone's own speech recognition, which is free.
- The words land in the box to read and change before anything is sent.
  Nothing is recorded or kept by the hub.
- A phone that can't listen (often an iPhone app on the Home Screen) gets
  no dead button. Instead it says where the keyboard's microphone is.

**The rules (`prayers`, `prayerAnswers`, `prayerSettings`):**
- A request is read only by:
  - the person who asked
  - the Pastoral group (`onPastoral()`, the same as "I'm worried")
  - the prayer team, if chosen
- **Not a master admin.**
- Only the person can mark it answered or take it back. Nobody can change
  what was asked, or who sees it.
- Answers: signed in only. Only the pastoral team can hide one.

**Proved:**
- **Rules:** 29 new checks, 1182 in all.
- `prayer.test.mjs`: 19 checks at 375px in app mode, with a stand-in
  speech recogniser.
- **7 deliberate breaks, all caught:**
  - **the one that matters:** the prayer team reads pastoral-only
    requests
  - anyone signed in reads requests
  - Speak puts nothing in the box
  - a dead Speak button on a phone that can't listen
  - the shared answer carrying the private request
  - prayer showing when switched off

**For the main window:**
1. "Prayer" (`prayer.html`) in the Menu, and as a row on the app's Me tab.
2. `prayer` in "What does your church use?", under People and groups.
3. Optional: a notification to the pastoral team when a request arrives.
   This would need a small trigger. The spec doesn't ask for it, so I
   haven't requested it.

### F-167 — "I'm new here" (NEXT-BRIEF §24 item 12)
Feature name **`newHere`**. The page is `newhere.html`. **No server
function is needed.**

**For visitors, who are usually not signed in:**
- A welcome card in the church's name and logo, never asking anyone to
  sign in.
- The fields: name, "Would you like someone to get in touch?", email or
  phone, and an optional message with the Speak button.
- **Nothing is stored until Send:** nothing in the database, and not even a
  draft on the phone.
- It says "Thank you … Someone will be in touch soon", or "It is lovely to
  have you with us" for someone just saying hello.
- **Spam defence,** as on public sign-up: a hidden field a robot fills,
  and a minimum time to fill the form.

**Where a hello goes ("whoever the church chooses"):**
- **The welcomers:** people a master admin picks from the address book
  (`welcomeSettings/main`). They see the hellos on the same page, signed
  in, and mark them contacted.
- **One email address the church picks** (`welcomeSettings/public`; the
  enquiry address if it's empty) gets a copy of each.
  - It's sent from the page, the same way public sign-ups send their
    confirmations.
  - **Worth knowing:** like public sign-up, this means a public form can
    send email to that address (F-014). The hidden field and minimum time
    are the defence. A notification to the welcomers' phones would be the
    main window's alert function.

**The rules (`welcomes`, `welcomeSettings`):**
- Anyone can send a hello, of exactly this shape.
- Asking to be contacted needs an email or a phone number.
- Signed out, a hello can't claim to be from someone.
- **A hello is read only by the chosen welcomers and master admins.** Not
  an attender, and not the visitor who sent it.
- A welcomer can only mark it contacted. Only a master admin can remove
  one, for example when a visitor asks to be forgotten.
- Who the welcomers are isn't public. The email address is, because the
  page needs it.

**Proved:**
- **Rules:** 19 new checks, 1201 in all.
- `newhere.test.mjs`: 19 checks at 375px.
- **7 deliberate breaks, all caught:**
  - **the one that matters:** anyone signed in reads the hellos (caught
    by the browser test and by the rules tests)
  - who the welcomers are made public
  - asking for contact with no way to reply
  - a draft kept on the phone
  - the robot field ignored
  - the card showing when switched off

**For the main window:**
1. Where visitors meet it: a link or QR on the welcome desk and the church
   website, and perhaps a card on the app's Home for someone not yet in the
   address book. The page is public, at `newhere.html`.
2. `newHere` in "What does your church use?", under People and groups.
3. Your alert function (for prayer and pastoral care) could also cover
   `welcomes`, with no details in the alert.

### F-168 — REQUEST for the main window: my public pages that send email from the browser (NEXT-BRIEF §26 item 14, d121a06a)
**Why:** when the email service's open path closes on switch-over day, a
signed-out browser can no longer send. These are **every place where one
of my pages can send email with nobody signed in.** Each needs to move to a
server trigger (your alert/email function), sending the same email from
the saved record. When each one lands, I'll take the browser send out of
the page and test it, as I'll do for `newhere.html` once your alert
function covers `welcomes`.

| # | Page (signed out) | When | To whom | Trigger on | Code today |
|---|---|---|---|---|---|
| 1 | `signup.html` (an event's page) | someone signs up, or joins the waiting list | **the person**: confirmation, manage link, calendar file | `signups` created | `signup.html:307`, `EGBCEvents.confirmationEmail` |
| 2 | `book.html` (book or hire a room, including public hirers) | a booking is requested | **the person**: "waiting", with the dates and references | `bookings` created, status `requested` | `book.html:187`, `B.emailMany(…, 'waiting')` |
| 3 | `book.html` | the same | **the site's office**: "Booking request …" (the site's bookings email, else the enquiry email) | the same | `B.tellOffice` (`egbc-events-bookings.js:541`) |
| 4 | `my-booking.html` (a hirer's own booking, by its link) | a hirer asks to cancel | **the site's office** | `bookings` updated, `cancelRequest.status` becomes `asked` | `my-booking.html:169` |
| 5 | `form.html` (a parent filling in a form from a link) | a form is completed | **the person**, and the form's team, as `F.doneEmail` builds it | `formResponses` created | `form.html:265` and `:311` |
| 6 | `groups.html` (Find a group) | someone asks to join a small group | **the person** (a copy), and **the group's leaders** | `smallGroupRequests` created | `groups.html:210` and `:215` |
| 7 | `newhere.html` | a visitor says hello | **the address the church chose** (`welcomeSettings/public`) | `welcomes` created | `newhere.html:110` (already planned) |

**Not on the list,** because they're only ever sent by someone signed in
(an admin, a leader or the office), which still works after switch-over:
- `bookings-admin.html`: approve, decline, move, payments, deposits,
  invoices
- `events-admin.html`, `forms-admin.html` and `kids-admin.html`: form
  requests and reminders to parents
- `kids-checkin.html`: "first time here" at the door, sent by a leader
- `groups-admin.html` and `safeguarding.html`
- maintenance and closures in `egbc-events-bookings.js`

**Each email's wording is already in a function of mine** (named in the
last column), so a trigger can build exactly the same message. Copy the
file into `functions/`, as with `notify-core.cjs`. Tell me which you take,
and I'll remove the browser send and change the page's "we have emailed
you" wording to match.

### F-169 — Gift Aid declarations (NEXT-BRIEF §24 item 6)
Feature name **`giftAid`**. The page is `giftaid.html`, signed in, and it
works in app mode. **No server function is needed.**

**A person declares in the app:**
- They see HMRC's standard wording in the church's own name: "I want to
  Gift Aid any donations I make in the future, and have made in the past 4
  years, to … I am a UK taxpayer and understand…".
- The fields: name (filled from their record), house name or number, the
  rest of the address (optional), and postcode.
- A **"Yes, I am a UK taxpayer…" tick is required.**
- The exact words they agreed to are kept with the declaration.
- Afterwards: "You have a Gift Aid declaration from …", with "Change my
  name or address" and "I no longer pay enough tax, or want to stop".
  Cancelling takes effect from today and doesn't change what's been
  claimed.

**The office records paper declarations:**
- They pick the person from the address book and enter the date on the
  form.
- A **"The signed paper declaration is held by the church" tick is
  required.**

**The office and the treasurer** (master admins, the Church office group,
the Finance group):
- They get the list of active declarations, and the cancelled ones kept
  separately.
- **"Download the list (CSV)"** gives: title, first name, last name, house
  name or number, postcode, declaration date, how made (online or paper),
  status, cancelled on.
  - The donor columns are in the order HMRC's claim schedule asks for.
  - Cells are guarded against spreadsheet formulas.

**The rules (`giftAid`), tight because this is sensitive:**
- **Read by the person (their own) and the office and treasurer only.**
  Not another member, not an admin of another area, and not signed out.
- **In the app, only for yourself,** with the taxpayer tick and the words.
  "On paper" only by the office, with the paper held.
- What was declared, when, how and by whom never changes. Only the
  person's name and address can be kept up to date.
- **Cancelling can't be undone.** Declaring again makes a new record.
- **Nobody deletes one, not even a master admin.** HMRC expects them kept
  (at least six years after the last claim that relies on one). Removing
  old ones would be a scheduled job, once the treasurer decides the
  period.

**Proved:**
- **Rules:** 21 new checks, 1222 in all.
- `giftaid.test.mjs`: 20 checks at 375px.
- **9 deliberate breaks, all caught:**
  - **the one that matters:** any member reads every declaration (caught
    by the browser test and by the rules tests)
  - an admin of another area reads them
  - a master admin can delete one
  - a cancelled declaration brought back
  - declaring without the taxpayer tick
  - "on paper" without the paper held
  - the CSV columns out of order
  - Gift Aid showing when switched off

**For the main window:**
1. "Gift Aid" (`giftaid.html`) on the app's Me tab and in the Menu, for
   everyone signed in. The office and treasurer's list is on the same
   page.
2. `giftAid` in "What does your church use?", under Giving and money.
3. The Give page (yours) could link to it: "If you pay UK tax, add Gift
   Aid".

**For Martin and the treasurer:**
- **Who sees the list:** the Church office and Finance groups. Check their
  members.
- **The church's name** on the declaration comes from Church details. If
  HMRC knows the church by another name (its registered charity name), it
  should be set there.

### F-170 — F-168 done on the server: `functions/public-mail.js`, ready to deploy (NEXT-BRIEF §26 item 14)
**What it is:** one new file of mine, `functions/public-mail.js`, with
the seven emails from F-168 as Firestore triggers on what the pages save:

| Trigger | Fires when | Sends |
|---|---|---|
| `publicMailSignup` | `signups` created | the sign-up confirmation, with its calendar file and check-in codes |
| `publicMailBookingAsked` | `bookings` created, status `requested` | "your booking is waiting" to the person |
| `publicMailBookingOffice` | the same | "Booking request" to the site's bookings address, else the enquiry email |
| `publicMailCancelAsk` | `bookings` updated, `cancelRequest.status` becomes `asked` | "Asking to cancel" to the same office address |
| `publicMailFormDone` | `formRequests` updated to `done` | "Received", with the private link to what was sent |
| `publicMailGroupAsk` | `smallGroupRequests` created | a copy to the person, and the group's leaders |
| `publicMailNewHere` | `welcomes` created | "Someone new said hello" to the address the church chose |

**For the main window: one line at the end of `functions/index.js`.**
```js
export * from './public-mail.js';
```
Nothing else of yours changes. My test runs your functions from a
scratch copy with exactly this line added, so I never edit `index.js`.

**How it sends.** It uses the server's Google identity, exactly as your
`sendOne` does, and writes the same `emailOutbox` row, plus `source`,
`kind` and `ref`. **There is one difference: it carries attachments.**
`sendOne` sends none, and the sign-up confirmation needs its calendar
file and check-in codes. So `public-mail.js` has its own copy of
`sendOne` with attachments added.
- If you would rather `sendOne` took attachments, say so and I'll call
  yours instead.
- Two things go in the outbox row differently. Attachments are listed by
  name only. A link to someone's medical answers (`&s=…`) is written as
  `&s=(hidden)`, because not everyone who may read the outbox may read
  those answers.
- My check compares my `SEND_EMAIL_URL` with yours and fails if they
  ever differ.

**The words are the pages' own.**
- `functions/public-mail-pages.cjs` is my page files, copied word for
  word by `screenshots/events/public-mail-pages.mjs`. Your
  `egbc-email.js` is included for `wrap`; it's read, never changed.
- They run in a sandbox that keeps English time. In June, 19:30 is
  19:30 in the email and 18:30 UTC in the calendar file. In December,
  19:30 is 19:30 UTC.
- If you change `egbc-email.js`, my check says the copy is stale and I
  re-run the copy. There's nothing for you to do.

**The switches,** each `churchSettings/features.<name>`, false = off:

| Switch | Covers |
|---|---|
| `events` | the sign-up |
| `roomBookings` | booking waiting, booking request, asking to cancel |
| `forms` | form received |
| `smallGroups` | asking to join a small group |
| `newHere` | "I'm new here" |

The first four are new names, for "What does your church use?".

**"I'm new here": I send it, not your alert function.** One of us, not
both. If your alert function already sends a copy for `welcomes`, please
take that part out.

**Two things that change.**
- `rooms.html` (signed in) also made "waiting" and "Booking request"
  emails for a member's request. The same trigger now sends those, so
  there are no doubles. `rooms.html` still sends its own "confirmed"
  email.
- **A small group's leaders are now always told.** Before, the page could
  only tell them when a member asked, because a guest can't read the
  leaders' addresses.

**Order on the day. THIS MATTERS:**
1. Martin deploys the functions, with the one line added.
2. **Then** the page changes go live. They are pushed, but on the branch
   `events-f168-pages`, not on main. If the pages stopped sending before
   the triggers existed, guests would get no emails at all. If the
   triggers come first, the worst is a few minutes of duplicates.
3. I merge the branch when told the deploy is done, and run the checks
   again.

**Proved:**
- `public-mail.test.mjs` (41 checks) runs the real functions in my
  functions emulator. It covers:
  - the seven, with the right words and addresses
  - a walk-in at the door, which is never emailed
  - one email for a repeating booking
  - every switch
  - a trigger run twice sends once
  - **with sendEmail's open path OFF:** a stand-in sendEmail that refuses
    anything without a Google identity token. With the server's token
    the email goes, attachments and all. Without it, it's refused and
    the refusal is recorded.
- The page checks (e1, e2, c5, c7, r2, r3, newhere) now prove each page
  sends nothing itself, then check the email the server's own code
  builds. e1 reads the server's check-in codes back in a browser.

### F-171 — NOTICE for the main window: I'm about to change your rota and planner files (Martin's job, 14 Oct)
**Martin has asked me to do this while you're busy:**
1. Rotas hide past dates.
2. UK dates in the planners.

He approved changes to the ORIGINAL site, outside v2, for exactly these
pages, and nothing else.

**Your files I'll edit:**
- `egbc-core-rota.js`:
  - a "Show past dates" toggle, after Hide Assigned
  - past dates hidden by default
  - opens at the next date
- `egbc-core-planner.js`:
  - "Service date" becomes a list of the coming services, with ◀ ▶ and
    "Pick another date"
  - the email shows "Sunday 11 October 2026"
  - `#spDate` keeps the same yyyy-mm-dd value underneath
- v2 pages: `Planner.html`, `view-only-rota.html`,
  `SundayServicePlanner.html`, `youthserviceplanner.html`,
  `song-summary.html` (the date it shows)
- The same pages at the root, plus the root `CoreTeamApp.html`

**Please don't edit these until I push.** I'll add a line here when it's
in.

**One thing for you afterwards:** bump the `?v=` on `egbc-core-rota.js`
and `egbc-core-planner.js` in `CoreTeamApp.html` and `app.html` (yours),
so phones fetch the new copies.

Nothing about editing, assigning, archiving or terms changes.
`worshiphubapp.html` isn't touched.

**F-171 is in (14 Oct).** You can edit these files again. Pull first.

**What changed in your files:**
- **`egbc-core-rota.js`:**
  - a "Show past dates" button after Hide Assigned
  - rows are hidden only when they are drawn; `cachedEvents`, Auto-Fill,
    Gather Avail and archiving all see every event as before
  - a month's serving totals still count its past Sundays
  - each row has `data-date`
- **`egbc-core-planner.js`:**
  - the "Service date" list goes in above `#spDate`
  - `#spDate` keeps its id, its `onchange` and its yyyy-mm-dd value, and
    is hidden until "Pick another date"
  - **it still opens on the coming Sunday:** your `comingSunday()` and
    `check-core-planner`'s expectation are unchanged
  - the emailed plan and its subject say "Sunday 11 October 2026"
- **The helper:** each page and each `egbc-core-*.js` carries one
  identical copy of `EGBCUKDates`, between the markers
  `egbc-uk-dates` … `end egbc-uk-dates`. The canonical copy is
  `screenshots/events/uk-dates-snippet.js`. `rota-dates.test.mjs` fails
  if any copy differs. The copy is there because the original site
  loads nothing shared.

**For you:**
1. **Bump `?v=`** on `egbc-core-rota.js` and `egbc-core-planner.js` in
   `CoreTeamApp.html` and `app.html`.
2. **Please run your checks**, which I can't run because they use your
   emulators:
   - `check-core-planner`
   - `check-emailed-plan`
   - `check-youth-access`
   - `compare-with-original`
   - `check-form-in-browser` (it reads `#eventList` buttons)

   They set `#spDate` / `#serviceDate` and fire `change`, which still
   works and is tested. `compare-with-original` may now see a
   difference in "Service date": the list, and the email's long date.
   That difference is Martin's request.
3. **Not done:** the original site's `song-summary.html` still shows
   2026-10-11. Martin's list for the original site didn't name it, and
   he said no other root changes. The v2 one is done. If he wants the
   original's done too, say so.

### F-172 — F-168 is live; for the reviewing window: where each of the seven emails gets its address (sendEmail's KNOWN_SOURCES)
**Done, 14 Oct:**
- `events-f168-pages` merged (19050174) after the deploy (ecf5dc50).
- Checked live: none of signup, book, my-booking, form, groups or
  newhere has an email send left in it.
- The sign-up page says "A confirmation is on its way to you by email".

**sendEmail refuses an address it doesn't know.** These are the
addresses the triggers send to. **Please check each against Calla's
KNOWN_SOURCES.** I think the ones marked ⚠ may be missing:

| Trigger | Sends to | Read from |
|---|---|---|
| publicMailSignup | the person | `signups/<key>.email` |
| publicMailBookingAsked | the hirer or member | `bookings/<key>.requester.email` |
| publicMailBookingOffice | the site's office | ⚠ `sites/<siteId>.bookingsEmail` (a site's own address, set in Places ▸ Bookings), else `churchSettings/details.enquiryEmail` |
| publicMailCancelAsk | the site's office | ⚠ the same `sites/<siteId>.bookingsEmail`, else the enquiry email |
| publicMailFormDone | the parent | ⚠ `formRequests/<key>.email` |
| publicMailGroupAsk | the person | ⚠ `smallGroupRequests/<id>.email`. A guest also gets a `contacts` record with the same address, if contacts count. |
| publicMailGroupAsk | the group's leaders | `addressBook/<id>.email` |
| publicMailNewHere | the church's chosen address | ⚠ `welcomeSettings/public.notifyEmail`, else the enquiry email |

If one is refused, nothing breaks for the person who sent it. The refusal
is recorded in `emailOutbox` (`source: public-mail`, `ok: false`).

**Also in:**
- The original site's `song-summary.html` shows "Sunday 11 October 2026",
  the same as v2.
- `rota-dates.test.mjs` is now 53 checks. It covers 13 copies of the
  helper, plus a check of what the original song summary says.

### F-173 — "I'm new here": "Save the address" did nothing on the live hub (Martin, 14 Oct)
**Why the page said nothing:** none of its saves had an error handler.
- the address
- adding or removing someone who sees the hellos
- "Mark contacted"

A refused save simply vanished. A wrongly typed address was also
ignored without a word.

**Why it was refused (almost certainly):** the live database still has
the old rules. The rule allowing `welcomeSettings` writes is in my events
section, and that only goes live at switch-over. I can't read the live
rules to prove it.
- The reviewing window saving `av@esherchurch.org` another way fits this.
- So does the page's own hello still working live. Old rules allow
  writes to collections that existed before; `welcomeSettings` is new.

**Fixed:**
- Every save on the page now says "Saved: …" when it works.
- It says "Not saved: the hub would not accept it…" when it is refused.
- It says "That email address does not look right" for a typo.
- The message stays after the card is drawn again.
- `newhere.test` is now 23 checks: a typo, a save, and a refusal (a
  master admin who is no longer one). A break that hid the refusal
  message was caught.

**On switch-over day,** once the rules are live, the page saves for real.

### F-174 — Rooms made of other rooms: any room can be booked whole or in parts (Martin, 14 Oct)
**What it is:** a general Places feature, for any church.
- In a room's profile, "Made up of other rooms" lets an admin tick up to
  4 other rooms at the same site. This is how a hall is bookable whole or
  as halves.
- They can change it later, and the diary is redone to match.
- The profile also lets them change the capacity ("Holds").
- The room list says "made up of … + …" and "part of …".
- Nothing about any church is in the code. EGBC's Upper Room (Front +
  Side) will just be data, set up by the ChurchSuite import.

**How it works:** a room with parts has no day of its own.
- Booking it marks each part's day.
- It's free only when every part is.
- So booking the whole blocks the parts, and booking a part blocks the
  whole.
- Two combined rooms sharing a part block each other.
- This covers members, the office, hirers' requests, approving, moving,
  cancelling, a member cancelling their own, event bookings, the day
  chart, book, rooms and hire.
- Closing a whole room closes its parts. Closing one part makes the
  whole unavailable.
- A service on the rota held in the whole room takes each part too.

**The rules** (my section only) check the same thing:
- a whole-room booking must mark every part
- a part can't be marked by a booking of another room
- a request needs every part free

**⚠ BEFORE A COMBINED ROOM IS SET UP ON THE LIVE HUB:** the live
database still has the old rules. Under them, a member's instant booking
of a whole room is refused, because it writes the parts' days. Office
bookings and approvals work either way. So the combined-room rules need
to be live, at switch-over, before members book the Upper Room as a
whole. The ChurchSuite import's Upper Room should wait for that, or
members will be told to ask the office.

**Proved:**
- `combined-rooms.test.mjs`: 32 checks. An admin builds a combined room
  from scratch in Places, then members, the office, the day chart,
  closures, and changing the parts later.
- Rules: 14 new checks, 1237 in all. Three deliberate breaks, all
  caught.
- The browser breaks are still to run. Two of my own leftover processes
  hold the test ports, and auto mode won't let me stop them.

**For the main window:** none of your files changed.

### F-175 — Call a parent: phone first, screen last (Martin, 14 Oct). REQUESTS for the main window
**Done in `kids-checkin.html`, for any church.** The buttons now come in
this order:
1. **"Call on their phone"**, the main button.
2. **"Ring"** (tap to call), beside it.
3. **"Show on screen"**, the last resort: a small link below the others,
   and only after a confirm step on the page, not a browser box: "This
   shows the screen number to the whole church. Use it only if the
   parent hasn't answered their phone." [Show on screen] [Cancel]

After a call, the page says what happened ("Sent to 1 phone at 10:42."),
and only then does "No answer yet?" turn the screen link into a button.

The screen button is never drawn when:
- the church has switched it off (Kids Church settings, below)
- the feature `screenPaging` is off in "What does your church use?"
- no ChurchShow is connected for the building
- the child has no screen number

**THE SCREEN SHOWS A SCREEN NUMBER, NEVER THE COLLECTION CODE.** The
collection code lets someone take a child home, and it was going on the
screen for the whole church.
- Each family now gets a three-digit screen number each morning, in
  `checkins.screenNo`, the same way it gets its collection code.
- It's printed on the parent's slip beside the code.
- The screen says "Screen number 427: please come to Juniors".
- The rules now refuse anything else on a screen page, and refuse a
  screen page when the church has switched screen numbers off.
- **Is this "the safeguarding fix" Martin meant?** If that was something
  else, tell me.

**The setting:** Kids Church settings ▸ Calling a parent, "Allow showing
a number on the service screen" (`kidsSettings/<site>.screenPaging`). It's
on unless switched off, and Kids Church leads and master admins can
change it.

**FOR THE MAIN WINDOW:**
1. **`egbc-app-kids.js`** (the app's Kids Church "Today"): the same order,
   the same confirm step, the same rules about when the screen button is
   drawn, and the screen number, never the code. Copy `kids-checkin.html`'s
   `callButtons` / `wireCall` / `wireScreen` / `showOnScreen`.
2. **ChurchShow connected:** kids leaders can't read `devices`, so the
   page can't tell whether a building has a screen. Please have
   `functions/churchshow.js` keep `sites/<siteId>.churchShowConnected`:
   `true` when a device is paired, and `false` when the building's last
   active device is disconnected. **Until then the screen button stays
   hidden everywhere.** That's safe, but it means no screen numbers at all.
3. **The app's family check-in** should write `screenNo` too
   (`EGBCKids.screenNumber()`, one per family per morning). It should also
   show "Your screen number 427" beside "Your collection code" in
   `app.html`. Check-ins without one simply get no screen button.
4. **ChurchShow's display** (F-100 contract): `code` is now the screen
   number, and `message` reads "Screen number 427: please come to Juniors".
5. **Bump `?v=` in `app.html`** for `egbc-notify.js`, `egbc-events-kids.js`,
   `egbc-events-checkin.js` and `egbc-events-bookings.js`, all changed
   today. I bumped my own 22 pages.
6. **Add `screenPaging`** to "What does your church use?", under Kids.

**Proved:**
- `f098-screen.test.mjs`: 30 checks at 375px. It covers the order, the
  call result, the confirm step, Cancel, the screen number, the setting
  off (page and rules), and no ChurchShow.
- Rules: 1243, including 6 new.
- Eight deliberate breaks, all caught.
- `k2-sunday`: 38/38. Its "Page a parent" check became "Ring".

**F-175, 14 Oct: screen numbers can no longer clash.** The reviewing
window's catch: with about 30 families in, random numbers would match
roughly one Sunday in three, and the wrong parent would come.
- Each number is now reserved once, by one family, per site per day
  (`kidsScreenNos/<site>_<day>_<n>`).
- The rules refuse a second family's reservation, so even two desks at
  the same moment can't share one. The page re-rolls.
- The rules also refuse a check-in whose screen number isn't reserved for
  its own family.
- **Proved:**
  - 60 families in: 60 different numbers
  - ten more at the same moment: still all different
  - a family asking again keeps its number
  - with 899 of the 900 taken, the next family gets the free one
  - Rules: 1249 in all. Four deliberate breaks, all caught.
- **For the main window, the app's family check-in:** get the number with
  `EGBCCheckin.screenNoFor(siteId, day, familyId, groupId)`, not
  `EGBCKids.screenNumber()`. Then pass it to `kidsIn` as its last argument.

### F-176 — The picture library (Martin, 14 Oct). REQUEST for the main window: a Menu entry
**What it is:** one shared store of pictures, each with a name and tags.
Nothing about any church is in the code.
- **In the event editor:** "Choose from library" sits next to "Upload
  picture". A new picture gets "Save to library, to use again", ticked by
  default and named after the event.
- **An event points to a library picture; it doesn't copy it.** The event
  stores `calEvents.imageLibId` beside `image`. So every date of a
  repeating event, and every copy, uses the same file, uploaded once.
- **`picture-library.html` (admins):**
  - shows how many events use each picture
  - rename and tags
  - **Replace**, which updates every event that uses the picture
  - **Delete**, which first says on the page how many events use it.
    Those events then show no picture (the plain card) until someone
    picks another.
- **Feature name:** `pictureLibrary`. When it's off, the editor shows only
  "Upload picture" and the page says it's switched off.
- **Storage:** `library/<picId>/`. The rule is in `storage.rules`, events
  section, **written, not deployed**. It goes live at switch-over. Until
  then, live uploads to `library/` are refused by the old storage rules,
  and the page says "Not added: …".
- **Firestore:** `pictureLibrary/<id>`. Admins write it, anyone signed in
  can read it.

**For the main window:**
1. Add **"Picture library"** (`picture-library.html`) to the Menu for
   admins, beside Events.
2. Add `pictureLibrary` to "What does your church use?", under Events.

**Proved:**
- `picture-library.test.mjs`: 25 checks, screenshots at 375px.
- Seven deliberate breaks, all caught.
- The event tests still pass: public-whatson, r3-event-rooms, share,
  who-can-come, app-whatson.

**Also, rooms made of parts (F-174):** all six browser breaks now run and
are caught. The first one exposed a gap in my test: it only ever booked
the front half. It now also books the back half alone.

### F-177 — The ChurchSuite import: ready for Martin's yes, then the reviewing window runs it live (Martin, 14 Oct)
**The tool:** `tools/import-churchsuite.mjs` writes; `tools/churchsuite-plan.mjs`
works out what to make, holding nothing about any church.
- **What it reads:** the church's own files, kept privately and never in
  the repo: `rooms.md`, `cs-embed.json` and `cs-nonpublic.md`.
- **What it makes, in this order:**
  1. the building
  2. its rooms (the Upper Room made of Front + Side, as data)
  3. the places that aren't rooms ("Off site" for homes)
  4. the 4 pictures into the library
  5. the events: one per date, joined as series, each pointing to its
     library picture
  6. the room bookings: the events' own rooms, plus the hires, with the
     hirer's name only
  7. the small groups, with their dates and members-only kept
  8. the maintenance job
- **It never makes:** Sunday services (it lists them for the rota) or
  people.
- **Safety:**
  - With no `--write` it only prints.
  - It never writes live without `--live`.
  - Every id comes from ChurchSuite's, so running it twice makes nothing
    twice.
- Everything it makes is ordinary hub data, edited afterwards on the
  ordinary pages.

**THE LIVE RUN (the reviewing window, after Martin says yes),** from the
v2 folder:
```
gcloud auth application-default login
node tools/import-churchsuite.mjs --from "C:\Users\marti\OneDrive\Documents\New hub\churchsuite-import" --rota-category Sundays --as-maintenance "PAT Testing" --as-booking "Riverside Drive AGM Meeting" --place "Riverside Drive AGM Meeting=<ROOM MARTIN NAMES>"
(look at it again; then the same with --live --write)
```

**Waiting on Martin:**
1. **Which room the Riverside Drive AGM is in.** ChurchSuite gave none.
   Without `--place`, that one booking is left out, and the run says so.
2. **"Youth worship practice"** had sign-ups with no limit. The hub needs
   a number, so it's imported with sign-ups off; set them in the editor.
3. **"Office Closed" from 28 Dec** has no end date. It's shown until
   31 Dec.
4. **Bereavement Cafe had three pictures** across its dates. The first is
   used for every date (one library picture).
5. **The Upper Room as a whole:** members booking it themselves needs the
   new rules live (F-174). Office bookings work now.

**For the main window, the rota (not made as events):**

| Date | Time | Service | Speaker |
|---|---|---|---|
| 18 Oct | 10:00 | Morning Worship | Ryan Ahern |
| 25 Oct | 10:00 | Morning Worship | Ryan Ahern |
| 1 Nov | 10:00 | International Day of Prayer for the Persecuted Church | |
| 8 Nov | 10:00 | Remembrance Sunday | |
| 15 Nov | 10:00 | Shoebox Sunday | Matt Stott |
| 22 Nov | 10:00 | Morning Worship | Jeanette Holt |
| 29 Nov | 10:00 | Baptism Sunday! | |
| 6 Dec | 10:00 | Morning Worship | James Griffin |
| 13 Dec | 10:00 | Family Nativity Service | |
| 20 Dec | 18:30 | Carol Service | |
| 25 Dec | 10:00 | Christmas Day Family Celebration Service | |
| 27 Dec | | No Service Today | |

**There's no event-to-group link in the hub.** The youth events (ReNu,
Lazers, Puppet Practice, Youth worship practice) are linked by their
team's label and organiser name. If you'd like a real field, I'll fill
it.

**Proved:**
- `churchsuite-import.test.mjs`: 35 checks, on invented files of the same
  shape, running the real tool. It covers the dry run, the building
  first, ChurchShow's page listing it, rooms made of parts, London times,
  series, the pictures once each, the events' rooms taken, hires with the
  name only, homes never named, members-only kept, nothing made twice,
  and an admin editing an imported event.
- Seven deliberate breaks, all caught.

**F-177, 14 Oct (after review): booking keys fixed; Martin's answers in.**
- **Imported bookings were readable by anyone who guessed them.** Their
  ids were made from the name, date and room (`bk_cs_…`), and a booking's
  id is the private key that lets anyone read it.
  - Now every imported booking, event bookings included, gets a random
    key like a real one: `bk_` plus 28 random characters.
  - The readable name lives in `importKeys/<name>` as
    `{ collection, bookingId, source, at }`. That's how a second run knows
    the booking. The tool writes it; only admins may read it (rule in the
    events section).
- **Checked: nothing else the import makes is readable signed out by its
  id.** Members-only events, a members-only small group, small groups'
  private parts and dates, maintenance jobs, places and the picture
  library all refuse a signed-out reader. Public events stay public.
  Capacity counters, room days, sites and rooms were already public by
  design, and hold no names.
- **New choice:** `--capacity "Name=30"`. It turns sign-ups on with that
  limit, for an event ChurchSuite gave no limit.
- **THE LIVE RUN, final (the reviewing window, from v2, after Martin's
  yes):**
```
gcloud auth application-default login
node tools/import-churchsuite.mjs --from "C:\Users\marti\OneDrive\Documents\New hub\churchsuite-import" --rota-category Sundays --as-maintenance "PAT Testing" --as-booking "Riverside Drive AGM Meeting" --place "Riverside Drive AGM Meeting=Sanctuary" --capacity "Youth worship practice=30"
(look at it again; then the same with --live --write)
```
- **Proved:**
  - `churchsuite-import.test.mjs`: 43 checks. They include random keys,
    no key that can be worked out from the name, date or room, the old
    readable key finding nothing, `importKeys` refused to a member and
    signed out, every private item refused signed out, `--capacity`, and
    a second run still making nothing.
  - Five more deliberate breaks, all caught. Rules: 1249.

**F-177, 14 Oct: the import in TWO PARTS (Martin's choice).** The live
database can be read signed out until switch-over (the reviewing window
checked: every collection answers a signed-out REST list).

**`--part public`, NOW:**
- the building and its 9 rooms
- the 4 library pictures, and the places the public events use
- the 14 public events (47 dates)
- the 23 bookings that hold rooms for **those** events, each titled with
  the event's name

Nothing members-only goes in this part: no hires, no small groups, no
maintenance job, and no import names for private items.

**`--part private`, ONLY ON SWITCH-OVER DAY, after the rules deploy:**
- the 3 members-only events (5 dates)
- the hires: AA ×46, PAH, Riverside Drive AGM in the Sanctuary
- the 3 small groups, with their private parts and 20 dates
- PAT Testing

It also names the building and rooms, which it makes only if they're
missing.

The tool refuses `--part private --live` unless `--rules-locked` is
given. Live, a part must always be named, so a whole run can't happen
live by accident.

**THE LIVE COMMANDS (the reviewing window, from v2):**
```
gcloud auth application-default login
OPTS='--from "C:\Users\marti\OneDrive\Documents\New hub\churchsuite-import" --rota-category Sundays --as-maintenance "PAT Testing" --as-booking "Riverside Drive AGM Meeting" --place "Riverside Drive AGM Meeting=Sanctuary" --capacity "Youth worship practice=30"'

NOW, after Martin's yes:
  node tools/import-churchsuite.mjs $OPTS --part public                    (look)
  node tools/import-churchsuite.mjs $OPTS --part public --live --write

ON SWITCH-OVER DAY, only after the rules are deployed:
  node tools/import-churchsuite.mjs $OPTS --part private                   (look)
  node tools/import-churchsuite.mjs $OPTS --part private --live --write --rules-locked
```
(On Windows, write the options out in full instead of `$OPTS`.)

**Proved:**
- `churchsuite-import.test.mjs`: 51 checks.
  - The public part makes only public events and their rooms' bookings.
    It makes no hires, groups, jobs or private import names.
  - **A public run then a private run make exactly what one whole run
    makes.**
  - Either part, or the whole, run again makes nothing new.
  - Both refusals work.
- Five more deliberate breaks, all caught.

**F-177: THE PUBLIC PART IS LIVE (14 Oct, run by the reviewing window).**
- **Made:** site 1, rooms 9, places 2, pictures 4, events 47, sign-up
  counters 5, event bookings 23.
- **A second run made nothing.**
- **Checked signed out:** What's On shows 48 dates and 7 pictures, and no
  private items.

**The private part waits for switch-over day (NEXT-BRIEF §26 item 15).**
Run it only after the rules deploy, with the second command above and
`--rules-locked`.

### F-178 — REQUESTS from the main window: who gets told (Martin, 14 Oct 2026)

Built on my side (A-087): Care & support, Church settings › Who gets told
(`careRouting/main`), and one set of alerts in codebase hub — `worryNotify`,
`prayerNotify`, `helloNotify` — which tell the named people **which kind**
came in and nothing else, never the office. Five requests for your pages and
rules:

1. **prayers: let the people told also read.** `prayerNotify` tells the
   people named for prayer requests (`careRouting/main.prayer.memberIds`)
   and, with nobody named, the safeguarding lead and deputy. Your
   `match /prayers` reads `onPastoral()` and the prayer team only, so they
   would be told and then refused. Please add
   `|| careNamed('prayer') || sgLeadOrDeputy()` to its read (both functions
   are in my part of the rules, above `match /worries`).
2. **prayers: no safeguarding lead, no send.** Martin: with no lead set the
   form refuses a message that would reach nobody. Please add
   `&& sgLeadSet()` to the prayers create rule, and on prayer.html read
   `careRouting/status` (readable by anyone signed in): `leadSet === false`
   → hide the form and say, as worried.html does: "Messages cannot be sent
   from here yet, because the church has not yet named who receives them.
   If someone is in immediate danger, call 999. Otherwise, please speak to
   one of the church leaders in person - for example after a Sunday
   service."
3. **newhere.html: nothing to do.** Your `publicMailNewHere` (F-168) sends
   the church its copy; my `helloNotify` only tells the welcomers that a
   visitor said hello, with no details. (An earlier draft sent the copy
   too; taken out before it was pushed.)
4. **Care & support on your pages.** Nothing to do: the website bar draws
   it on every page with the shell. prayer.html is linked from the choice
   ("Ask for prayer") and now has the button too.
5. **"What does your church use?" (item 14)** will gain `prayer`, `newHere`
   and `care` (the whole care and safeguarding part — the only switch that
   hides Care & support). Say if you'd group them differently.
6. **Two checks are red on your new pages.** `check-every-page-is-checked`
   names newhere.html, prayer.html, watch-admin.html and whatson-embed.html
   (add each to `tests/group1-screens.mjs`, or to its NOT_YET with a reason).
   `check-menu` names whatson-embed.html as a page with no shell and no
   reason (add it to NO_MENU there, with why — an embed has no Menu).

### F-175 (reply from the main window) — the collection code no longer leaves the slip

`callParent` (functions/notify.js) now sends the group and **`ck.screenNo`**
("Number 14 on the screen"), or no number at all if the check-in has none
("A leader is asking for you"). It never sends `pickupCode`: not in the
phone notification, the email fallback or the log.
`check-notify-send` asserts that, 81/81. The break "send pickupCode again"
is caught (2 fails). **Needs functions:hub deployed.**

For your files:
- `screenshots/events/notify-unit.test.mjs` and `notify-e2e.test.mjs` still
  expect "Collection code K7P2" / "Collection code Q7P2", so they'll go red.
  Please change them to the screen number, and assert the code is absent.
- `screenNo` doesn't exist anywhere yet. I've read it from the check-in
  document as `screenNo`, so please write it there under that name.
- `kids-today.test.mjs` line 171: "Show on screen" puts the family's
  **code** on the church screen ("K7P2, please come to Little ones"). By
  Martin's rule that should be the screen number too.

### F-179 — URGENT REQUEST from the main window: prayer.html and newhere.html must not save before switch-over

The reviewing window (14 Oct): until the locked rules are on, the live
database answers a signed-out list for every collection, `prayers` and
`welcomes` included. So **a prayer request or a hello saved today is
public.** Martin's rule: no private form saves until
`churchSettings/launch.rulesLocked === true`. A master admin turns that on
from Church settings › Private forms, straight after the rules deploy
(NEXT-BRIEF §26 item 16).

**Done on my side:** `egbc-launch.js` (shared). worried.html (pastoral care
for me, and both kinds of concern) uses it: with the flag unset it shows
the words below instead of the form, and asks again at the moment of
sending. `check-care`: nothing is written with the flag unset, it saves once
set. Both breaks are caught.

**Please, on prayer.html and newhere.html:** load
`egbc-launch.js?v=202610141700`, and before showing the form, and again just
before writing:

```js
EGBCLaunch.check().then(function (L) {
  if (!L.locked) { /* hide the form; show */ EGBCLaunch.notYet(L.opensOn); }
});
```

The words are: "If someone is in immediate danger, call 999. This form
opens on <date>. Until then, please speak to a church leader in person."
They come from `notYet()`. The date is `opensOn` on the same document, and
until it's set the sentence reads "when the new church hub opens".
`churchSettings/launch` is readable signed out, so newhere.html can read it.
A test each: with the flag unset nothing is written; with it set, it saves.

**F-170 and F-172: CLOSED (14 Oct).** Every address source is in
sendEmail's KNOWN_SOURCES.

### F-180 — The ChurchSuite parity check: nothing the church uses today is lost at switch-over (Martin, 14 Oct)
**Where this comes from.** Martin's own 43 ChurchSuite phone screenshots
(9 Oct), the church website, and §6.17 of the bookings brief. Read-only:
feature and screen names only. No people, contacts, children or room-hire
details are copied here.

**One thing to know first.** Martin's ChurchSuite login only shows
**Calendar, Rotas and Account**. Other parts may be switched on for other
people. The screens hint at them (questions 6 and 7 at the end):
- the Calendar settings have a **Check-in** tab
- events are "not linked to a **Booking**"
- an email template asks for **consent for a child**
- the website's Giving page uses a **ChurchSuite form**

**Built today (mine), so these are now Same:**
- **Featured events for the website**
  (`whatson-embed.html?view=featured`). This is ChurchSuite's "Featured"
  website embed.
  - Picture cards. A repeating event shows as one card ("and 2 more
    dates").
  - Only public events, even when a hub admin is looking.
  - `&all=1` shows every public event. `&combine=0` gives every date its
    own card.
  - Its code is in events-admin, under "On the church website".
- **For the notices** (events-admin). This is ChurchSuite's "event details
  for a notice sheet" report.
  - Pick a Sunday and 1, 2 or 4 weeks. You get the events as plain words,
    a day at a time, with Copy and Download.
  - It never includes not-listed, held or cancelled events.
  - Church-members-only and team events appear only when ticked.
- **Deleted events** (events-admin). This is ChurchSuite's "deleted events"
  report.
  - Deleting a series first records what it was, its dates, and who
    deleted it when. If that record can't be written, nothing is deleted.
  - Only admins can read the list. Nobody can change or remove it.
  - New rule: `calEventsDeleted`, in my section of firestore.rules. **Not
    deployed**; it goes live at switch-over with the rest.
- **The church's own event categories** (events-admin, "Event categories").
  ChurchSuite has 21; the hub had a fixed eight.
  - Rename, recolour, add, and retire. A category is never deleted. A
    retired one isn't offered for new events, but events already in it keep
    it.
  - The first save turns the built-in eight into the church's own list,
    so no event loses its category. An unknown category reads as "Other".
  - What's On, the sign-up page, the website embed and the app all use the
    church's list (loaded with the rooms and sites they already wait for).
  - New rule: `eventCategories`: anyone reads, admins write, nobody
    deletes. **Not deployed.**
  - The ChurchSuite import still maps ChurchSuite's 21 onto the eight. Once
    the office has made the church's list, it can recategorise events.

**The table**

| What ChurchSuite does | Who uses it | Where it is in the hub | Same / better / MISSING |
|---|---|---|---|
| **CALENDAR** | | | |
| Calendar of events (116 coming up), month view, add and edit | office, organisers | events-admin, What's On, app What's On | Same |
| Categories (21), each with a colour and brand | office | events-admin "Event categories": the church's own list | Same (built today). No "brand" per category |
| Labels (several per event) | nobody (0 labels) | events can carry labels | Not used |
| Repeating events ("sequences") | office | series in events-admin | Same |
| Event pictures | office | event picture and the picture library (F-176) | Better |
| Featured events | office | Featured tick; top of What's On; the new featured embed | Same (built today) |
| Who can see it (public / My ChurchSuite / hidden) and status (confirmed / pending / cancelled) | office | Who can come (not listed, everyone, attenders, church members, teams) and status | Better |
| Sign-ups: tickets, questions, limits, waiting list | organisers, public | signup.html, ticket types, questions, waiting list | Same |
| **Paying for tickets by card** (Stripe transfers report) | treasurer? | none: tickets are free or paid on the day | **MISSING if used**: question 1 |
| Event overseers | organisers | overseers on each event | Same |
| Notes and "View changes" (who changed what) | office | internal notes; "What changed" tab | Same |
| Sign-up and cancellation emails | public | sent by the server (`functions/public-mail.js`, F-170) | Same |
| Sign-ups communication report; email errors report | office | each event's own communication list (`commsLog`) | Same per event. **A church-wide list is MISSING**: request R8 |
| Website embeds: a list, a 2-month calendar, a featured grid | website visitors | `whatson-embed.html`: list, month, featured | Same. The hub's month starts on Monday (UK); ChurchSuite's started on Sunday |
| Subscribe to the calendar (iCal / Google / Outlook, per category) | members? | events: an "Add to calendar" file only. The rota has a live feed | **MISSING**: needs a server function. Request R7, question 5 |
| Import events | office | the ChurchSuite import (F-177) | Same (one-off) |
| Event details for a notice sheet | office | events-admin "For the notices" | Same (built today) |
| Deleted categories, events and labels reports | office | events-admin "Deleted events" | Same for events (built today). Categories and labels: not needed |
| Birthdays in the calendar | office | birthday.html | Same |
| Leave requests and setup | nobody (0) | not built: decided in §6.17 (belongs to HR) | Not copied (decided) |
| Label printing format for events (Brother 62×29 mm) | door team? | children's labels at check-in; no labels for adults at events | Question 8 |
| Bookings shown in the calendar; "event linked to a booking" | office | room bookings for events; bookings-admin, rooms (F-174) | Same or better |
| **ROTAS** (main window's) | | | |
| 14 ministries, 10 rotas: After Service Prayer, A/V, Creche, Flowers, Garden, Kids Church, Lazers Sunday, Police bakes, Preacher / Service Leader, Small Group Leaders, Stewards, Tea & Coffee, Welcome, Worship Group | leaders, volunteers | Worship, AV and Core Team rotas (Planner, view-only rota). Welcome and Tea & Coffee are planned as app team spaces | **MISSING for most ministries**: request R1, question 3 |
| Who is in each ministry, with their roles | leaders | teams in the address book | Same |
| Services (0) | nobody | — | Not used |
| Unavailability (on) | volunteers | availability form; the rota knows who can't come | Same |
| Accept / decline a rota date (off) | nobody | — | Not used |
| Reminders at 8am, by email **and text message** | volunteers | rota reminders by email and phone notification | Same, except **text messages: MISSING** (request R3, question 2) |
| Rota reports: clashes, not on a rota, overview, personal serving, serving frequency, not in a ministry, demographics, service notes | leaders, office | serving history in the planners | **MISSING mostly**: request R2 |
| My Rotas: next serving, my rotas, my unavailability | volunteers | app team space Rota tab; view-only rota | Same |
| **MY CHURCHSUITE** (the members' app; main window's) | | | |
| Home: next events, quick links | members | app Home | Same |
| My Communication (what the church has sent me) | members | none | **MISSING**: request R6 |
| My Details: details, photo, spouse, communication choices (email, text, rota reminders), privacy (who sees my phone or address), next of kin, login, delete my account | members | the app says "My details and my household arrive in the next stages" | **MISSING (planned)**: request R4 |
| My Events (my sign-ups) | members | my-signup.html; app What's On | Same |
| My Podcasts (sermons) | members | app Listen; sermons (F-138) | Same |
| Search for Others (members' directory) | members | the address book is office-only | **MISSING**: request R5, question 4 |
| Links (church website) | members | Menu and app links | Same |
| **ACCOUNT** | | | |
| Sites (1: Main site) | office | sites in Places | Same |
| User groups (Eldership, Finance, Safeguarding); a group's own shared email address | office | teams and roles; safeguarding pages | Same for access. **Sending as the group's shared address: MISSING**: request R9, question 9 |
| Gatherings (headcounts) (0) | nobody | headcounts.html | Better |
| Ready-made emails: consent request (adult and child), "check your details" reminder, app invitations; ready-made texts | office | consent is collected at children's registration; invitations come from the main window | Consent: Same. **"Check your details" reminder: MISSING** (part of R4). Texts: see R3 |
| Files (0) | nobody | resources.html | Not used |
| Admin reports: deleted emails, texts, gatherings, user groups | office | — | Not needed |
| **NOT IN MARTIN'S LOGIN: to confirm (question 6)** | | | |
| Children: check-in, labels, registers | Kids Church | kids-checkin, kids-admin, labels, registers, call a parent (F-175) | Same or better, if it is used |
| Small groups | group leaders | groups.html, groups-admin. In ChurchSuite they only show as calendar events and a "Small Group Leaders" ministry | Better |
| Bookings and resources | office | rooms, bookings-admin, hire, book, rooms made of parts | Same or better |
| Giving and Gift Aid | treasurer | give.html, giftaid.html (F-169) | Same, if ChurchSuite Giving isn't used. The website's ChurchSuite form: question 7 |
| Forms | office | forms-admin, form.html | Same |
| Address book and Communication (bulk email) | office | addressbook.html; church emails (main window) | Same for email; texts see R3 |
| **ON THE WEBSITE, NOT CHURCHSUITE** | | | |
| Tidio chat | visitors | — | Not ChurchSuite: question 10 |

**REQUESTS for the main window** (all yours; I changed none of your files):
- **R1. Rotas for the other ministries.** ChurchSuite has 14; the hub's
  rotas cover Worship, AV and Core Team. Which move, and when, is Martin's
  call (question 3).
- **R2. Rota reports:** clashes, not on any rota, serving frequency, personal
  serving history, not in a ministry.
- **R3. Text messages (SMS)** for rota reminders and church messages. Only if
  Martin says they're used (question 2). It needs a paid text service.
- **R4. My details in the app:** change my own details and photo, my
  communication choices, my privacy, next of kin, delete my account. Plus the
  office's "please check your details" email.
- **R5. A members' directory** ("Search for others"), showing only what each
  person has chosen to share.
- **R6. My messages:** what the church has sent me.
- **R7. A live calendar feed of events** to subscribe to in a phone's
  calendar, the way `rotaFeed` does for rotas. Public events for anyone;
  members' events only with the person's own key. I can write the events
  part if you'd rather; it needs a new file in `functions/`, which is yours.
- **R8. A church-wide communication list and email errors**, across all
  events.
- **R9. Sending as a team's shared address** (e.g. the safeguarding team).
- **R10. app.html: bump `egbc-events.js?v=` to 202610141900** (it is still
  on 202610101800), so the app's What's On gets the church's categories.
  Until then the app shows the built-in eight. Nothing breaks.

**Proved:**
- `parity.test.mjs`: 36 checks, at a computer's width and at 375px, signed
  out and as a master admin.
- Rules: 19 new checks; 1307 in all with the main window's newest.
- 17 deliberate breaks, all caught. The one that matters: the notices
  letting not-listed and held events through.

**Questions only Martin can answer:**
1. Does anyone pay for event tickets **by card online** through ChurchSuite?
   (It has a card-payments report.)
2. Does the church send **text messages** from ChurchSuite, for rota
   reminders or anything else?
3. Which of the **14 rotas** should move into the hub at switch-over, and who
   runs each one?
4. Do members use **"Search for others"** (the members' directory) in My
   ChurchSuite?
5. Has anyone **subscribed to the ChurchSuite calendar** in their phone's
   calendar?
6. Your login only shows Calendar and Rotas. Does **anyone else** use other
   parts: Address Book, Children (check-in and labels), Small Groups,
   Bookings, Giving or Communication? Who could look?
7. What is the **ChurchSuite form on the website's Giving page** for?
8. Are **name labels printed for adults** at events (the Brother 62×29 mm
   setting)?
9. Does the safeguarding team **send from its shared email address**?
10. The **Tidio chat** on the website isn't ChurchSuite. Keep it?

### F-179 answered — prayer.html and newhere.html save nothing before switch-over
Both pages load `egbc-launch.js?v=202610141700` and use `EGBCLaunch.check()`
twice: when the page opens, and again at the moment of saving.
- **prayer.html.** With `churchSettings/launch.rulesLocked` not true:
  - "Ask for prayer" shows the `notYet()` words instead of the form.
  - "Answers to prayer" lists what is there, but there is no sharing form.
  - "My requests" has no "It has been answered" controls.
  - All three saves (a request, marking it answered, sharing an answer)
    ask again first, and save nothing if it isn't open.
- **newhere.html.** With the flag not true the form never appears. Instead
  it shows the `notYet()` words and "Or say hello to someone on a Sunday".
  Send asks again first. The welcomers' own card (the hellos list and who
  gets them) is unchanged; it isn't a form a visitor fills in.

**Proved:**
- `prayer.test.mjs` 23/23 and `newhere.test.mjs` 26/26.
  - With the flag unset: no form, the words, and nothing saved.
  - With it set: everything saves as before.
  - A page opened while open, then closed at the moment of sending
    (`opensOn` 1 November), saves nothing and says when it opens.
- 5 deliberate breaks, all caught. The one that matters: a prayer request
  saved without asking again at the moment of sending.

### F-178 answered — who gets told, on my pages and rules (and F-175's notify tests)
1. **Done.** The `prayers` read rule adds `|| careNamed('prayer') ||
   sgLeadOrDeputy()`. Rules tests: someone named reads one and lists them
   all; a safeguarding lead reads one; nobody else does.
2. **Done.** The `prayers` create rule adds `&& sgLeadSet()`. prayer.html
   reads `careRouting/status`, and when `leadSet === false` shows
   worried.html's words instead of the form. Rules test: with no lead, a
   request is refused. prayer.test: with no lead named, no form and the
   words. (prayer.test now names an invented lead, since a request needs
   one.)
3. and 4. Nothing to do; agreed.
5. `prayer`, `newHere` and `care` as you list them is right.
6. **Your files, so please add these yourself** (my standing rules keep me
   out of `tests/*`):
   - `tests/check-every-page-is-checked.mjs`, in `NOT_YET`:
     ```
     'newhere.html': 'events window: proved by screenshots/events/newhere.test.mjs (26 checks, at 375px)',
     'prayer.html': 'events window: proved by screenshots/events/prayer.test.mjs (24 checks, at 375px)',
     'watch-admin.html': 'events window: proved by screenshots/events/watch.test.mjs',
     'whatson-embed.html': 'events window: an embed for the church website, proved by public-whatson.test.mjs and parity.test.mjs',
     ```
   - `tests/check-menu.mjs`, in `NO_MENU`:
     ```
     'whatson-embed.html': 'an embed inside the church website\'s own page (events window): no hub bar and no Menu, by design',
     ```

**F-175's reply:**
- notify-unit and notify-e2e now expect "Number 214 on the screen", and
  each asserts the collection code is nowhere: not in the push, the email
  or the log. notify-unit is 23/23, notify-e2e 36/36.
- `checkins.screenNo` is written by kids-checkin (F-175) under exactly that
  name.
- `kids-today.test.mjs`'s "Show on screen" asserts what the app does today,
  which is the family's code. That screen is `egbc-app-kids.js`, yours.
  When you switch it to `screenNo`, tell me and I'll change that line the
  same day.

**Proved:** rules 1314/1314; prayer 24/24. 4 deliberate breaks, all caught.
The one that matters: a request accepted with no safeguarding lead.
**Not deployed**: the rules go live at switch-over.

### F-181 — PLAN: taking money online through each church's OWN accounts - Stripe (card) and GoCardless (bank) (Martin, 14 Oct; revised twice)
**The rule (Martin):** "We are not taking the payments. We won't use our
account."
- Church HQ never receives, holds or passes on money, takes no fee, and
  depends on **no approval** from Stripe or GoCardless.
- Each church uses **its own** Stripe and/or GoCardless account. It
  pastes in its own key once, and the money goes straight to it.
- **No Stripe Connect and no platform account.** Stripe never issued Calla
  platform access, so nothing here may depend on it. This replaces the
  Connect plan.

**Feature names (rule 12):** `cardPayments` (Stripe) and `bankPayments`
(GoCardless). Each is off for every church until that church adds working
details for it, and can't be switched on without them.

#### 1. Who may set it up
- A **master admin**, or the church's **treasurer**: anyone on the money
  team the master admin names. The team is called "Finance" unless the
  church changes it.
- The server checks this on every call. Nobody else sees the Payments
  page's controls.

#### 2. The Payments page (`payments.html`, mine)
Two cards, Stripe and GoCardless, each with **a plain step-by-step guide
for a treasurer, with screenshots**.

**Stripe card:**
1. "In your Stripe dashboard, make a **restricted key** with only these
   permissions":
   - Checkout Sessions: write
   - Account / balance: read (so the hub can show which account it is)
   - Charges and refunds: read
   - Events: read
2. "Paste it here" (the box hides what is typed). Press **Check and save**.
3. "In Stripe, add a **webhook** pointing at
   `https://…/stripeWebhook` for these events":
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`
4. "Paste its **signing secret** (`whsec_…`) here." Press **Check and
   save**.

**GoCardless card:**
1. "In GoCardless, Developers › Create › **Access token**, read-write."
2. "Paste it here." Press **Check and save**.
3. "Developers › Create › **Webhook endpoint**, URL
   `https://…/gocardlessWebhook`; paste its **secret** here."

**After saving** the page shows, never the key itself:
- "Connected: Esher Green Baptist Church, acct …1234, **live** (real
  money)" or "**test** (no real money)"
- "added by Pat Treasurer on 14 Oct 2026"
- the webhook: "set" or "not set yet, so payments can't be confirmed"
- **Replace** and **Remove** (asks first, on the page)

Nothing can be read back. A key leaves the page once, to the server, and
is never sent to any page again.

**Screenshots for the guide:** Stripe's and GoCardless's own dashboards
can't be photographed here (no network, and no real accounts). So the
guide is written step by step now, with a box where each screenshot goes.
Martin, or a treasurer with a **test** account, takes them once, and the
guide shows them (question 2).

#### 3. Keys are kept on the server only
- Saving calls a function (`paymentsSave`) with the key. It **checks the
  key with the provider first**, then stores it.
  - Stripe: `GET /v1/account` gives the account id and name. A key
    starting `rk_test_` / `sk_test_` is test mode, `rk_live_` /
    `sk_live_` is live.
  - GoCardless: `GET /creditors` gives the creditor's name. A key starting
    `sandbox_` is test, anything else live.
  - A key that doesn't work is not saved, and the page says why in words.
- **Where:** `paymentSecrets/{stripe|gocardless}`, a collection the rules
  deny to everyone (`allow read, write: if false`). Only functions (the
  Admin SDK) read it.
  - **As built (F-191): no Secret Manager secret, for now.** A secret
    named in a function must exist before **any** `functions:hub` deploy,
    or every deploy fails. So the keys sit only in this rules-locked
    collection, which Firestore encrypts on disk as it does everything.
    Adding a Secret Manager master key on top (AES-256-GCM, `PAYMENTS_KEY`)
    is a small change, for when Martin has set that secret.
- What pages may read is `paymentSettings/{provider}`: connected, account
  name, the last 4 of the account id, live/test, who added it and when,
  and whether the webhook is set. Server-written; readable by admins and
  the treasurer.
- **Webhooks verified, per church:**
  - Stripe: the `Stripe-Signature` HMAC-SHA256 over `timestamp.body`
    with the church's `whsec_`, at most 5 minutes old.
  - GoCardless: the `Webhook-Signature` HMAC-SHA256 of the body with the
    church's secret.
  - Anything unsigned, wrong or late is refused.
  - Each event is acted on once (by its id), so retries change nothing.
- No new packages: the calls are plain `fetch`, and the signature checks
  are written out and tested against known values.
- **No fee ever:** no application fee or app fee is ever sent. A test
  proves no request carries one.

#### 4. Tickets: on the day / card / bank, any mix
- Each ticket type gets **"How people can pay"** (one or more):
  - On the day (as now, F-183)
  - Card (Stripe), offered only while `cardPayments` is on
  - Bank (GoCardless Instant Bank Pay), offered only while `bankPayments`
    is on
- **Paying online:**
  1. The sign-up is saved and takes its place, as now.
  2. "Pay £12.00 by card" or "Pay by bank" asks the server for a payment
     page.
  3. **The server works out the price itself** from the event's ticket
     types and the places (a whole series: all its dates with places).
  4. **Card:** a Stripe Checkout page made with the church's own key.
     **Bank:** a GoCardless Billing Request with a payment request
     (Instant Bank Pay), and its hosted flow.
  5. The person pays on the provider's own page. The hub never sees card
     or bank details.
- **Held for 30 minutes.** Paid: "Paid £12.00 by card / by bank". Not paid
  in time: the place goes back (the Checkout page's expiry; for bank, the
  server's own check of payments still waiting).
- **Refunds** are done in the church's own dashboard; the webhook tells
  the hub, which shows "Refunded £12.00". If someone cancels a paid place,
  the office is told: "refund £12.00 in Stripe / GoCardless if your
  policy allows".
- Door payments (F-183) are unchanged.

#### 5. Regular giving by Direct Debit (GoCardless), with Gift Aid
- On the Give screen, **"Give regularly by Direct Debit"** goes to my
  page `give-regularly.html`:
  - how much
  - monthly, or every 4 weeks
  - which day of the month
  - "Add Gift Aid" (if they are a UK taxpayer), which records a Gift Aid
    declaration exactly as `giftaid.html` does (F-169)
- The server makes a **GoCardless Billing Request with a mandate request**
  (Bacs). The person sets up the mandate on GoCardless's own page.
- Once the mandate is active, the server makes a **subscription** for that
  amount and timing.
- Each collected payment (the `payments.confirmed` / `paid_out` webhook)
  is recorded as a **donation**, with whether Gift Aid applies, so the
  Gift Aid report (F-169) can claim it. Failed or cancelled payments and
  mandates are recorded too.
- **The giver's own page** ("my regular giving", through their emailed
  link, or signed in): amount, next date, **Change amount**, **Stop**.
  Stopping cancels the subscription. The mandate is left, which is the
  usual way, and the page says so.
- **Who sees giving:** the treasurer only (the money team). Not event
  admins, and not the office.
- **The Give screen (`give.html`) is the main window's.** It needs one
  link to my page (question 4).

#### 6. The server (all mine; one new file, `functions/payments.js`)
- **Callables:**
  - `paymentsSave` (check and save a key or webhook secret)
  - `paymentsRemove`
  - `ticketPay` (card or bank, for a sign-up key)
  - `giveRegularly`, `givingChange`, `givingStop`
- **HTTPS:** `stripeWebhook` and `gocardlessWebhook`, each verified as
  above.
- **Scheduled:** `paymentsTidy` every 10 minutes. It gives back places
  still unpaid after 30 minutes (bank payments; Stripe tells us itself).
- Calls go to the providers through one base address each, so the tests
  point them at a **stand-in Stripe and stand-in GoCardless** on the
  emulator, with no network.
- **Rules** (my section):
  - `paymentSecrets`: nobody.
  - `paymentSettings`, `donations`, `regularGifts`: server-written;
    readable by the treasurer (the giver reads their own gift by its key).
  - `signupPayments`: the card and bank fields are server-only.
- **One line outside my files:** `export * from './payments.js'` in
  `functions/index.js`, as `public-mail.js` is exported. I'll add that
  line myself and say so, unless you'd rather the main window did.

#### 7. Building order
1. **Stripe:**
   - the Payments page (Stripe card and its guide), keys, webhook,
     tickets by card
   - a stand-in Stripe, tests and breaks
   - report
2. **GoCardless:**
   - the GoCardless card and its guide
   - Instant Bank Pay for tickets
   - Direct Debit giving with Gift Aid and its page
   - a stand-in GoCardless, tests and breaks
   - report

#### Questions
1. **The treasurer:** is "the master admin, or anyone on a team the master
   admin names (default 'Finance')" right?
2. **Screenshots:** they need a real (test-mode) Stripe and GoCardless
   dashboard. Can Martin take them, or open test accounts I can describe
   step by step?
3. **Direct Debit timing:** monthly on a chosen day, and every 4 weeks.
   Anything else (weekly, yearly)?
4. **The Give screen's link** to "Give regularly": the main window adds it
   to `give.html`, or I do?

### F-182 — SPEC for the main window (R7): a calendar people can subscribe to, that works
Martin tried ChurchSuite's calendar feed and **it didn't work**, so ours
must. You build the server function; I'll do the page side when it's there.

**The function: `eventsFeed`** (public HTTPS, no sign-in, like `rotaFeed`).
- `…/eventsFeed?church=1` gives **public events only** ("Everyone"). This is
  for the website and anyone.
- `…/eventsFeed?key=<key>` gives the events **this person may see** (public,
  attenders, church members if they are one, their teams). The key is per
  person, kept in `calendarKeys/{uid}.feeds['events']`, and can be reset
  like the rota links.
- `&cat=<categoryId>` (several allowed, comma-separated) gives just those
  categories (`eventCategories`, F-180).
- **Never included:** not listed, not public yet (pending), or another
  team's events.

**Each date:**
- One `VEVENT`, with `UID` = `<calEventId>@<church domain>`. It must never
  change, or calendars show duplicates.
- `DTSTART`/`DTEND` with `TZID=Europe/London` and a `VTIMEZONE` block. All
  day uses `VALUE=DATE`.
- `SUMMARY` is the title. `LOCATION` is the room names and site, as
  `E.locationText`.
- `DESCRIPTION` is the description as plain words, then the event's page
  link. `URL` is the event's page.
- `STATUS:CANCELLED` for a cancelled event, so calendars cross it out.
- `SEQUENCE` and `LAST-MODIFIED` come from `updatedAt`, so changes show up.
- Range: the last 30 days to 18 months ahead.
- `X-WR-CALNAME`: "<church name> – What's on" (plus the category name).
- Content-Type `text/calendar; charset=utf-8`, CRLF line endings, long
  lines folded at 75 bytes, `Cache-Control: max-age=900`.

**Why feeds "don't work", and what to check:**
- They must be https.
- Google only re-reads a feed every few hours. That's Google, not us; the
  page will say so.
- Line folding and CRLF must be right, or Outlook drops the feed silently.
- The UID must stay the same.

Tests: the output read back by an iCal reader; a not-listed and a pending
event are never in it; a cancelled one is `STATUS:CANCELLED`; a time on
the night the clocks change is right.

**My side, once the function exists:** What's on and the app's What's on
get "Subscribe":
- "Add to Google Calendar", Apple / Outlook (`webcal://`) and Copy link
- for everything or chosen categories
- signed in, "my events" with the person's own key and a Reset

### F-183 — Pay on the day: ChurchSuite's "pay on arrival" tickets, done properly
Before this, a ticket had a price and nothing else: no total, nothing in the
email, and no way to mark it paid at the door.
- **Sign-up page:** "To pay on the day: £10.00". It changes as tickets and
  people change, and shows again on the thank-you.
- **Confirmation email:** "To pay on the day: £10.00", made by the server
  from the event's own ticket types (`functions/public-mail.js`).
  **Needs the functions deployed by Martin.** Until then the email is as
  before.
- **"My place":** what's owed, or "Paid £10.00" once paid.
- **At the door** (checkin.html, for admins and the event's leaders):
  - "£10.00 to pay" appears once per booking, on its first person.
  - Pressing it asks how it was paid: Cash, Card, Bank transfer or Other.
  - Then it reads "Paid £10.00". "Not paid after all" undoes it.
- **Events › Who is coming:** a "To pay" column (an amount, or "Paid
  £10.00") and the event's totals: "£10.00 paid, £5.00 still to pay".
- What's owed is worked out from the event's ticket types each time, never
  stored on the sign-up, so a price corrected later is what the door sees.
  A waiting-list or cancelled place owes nothing.
- **New rule `signupPayments/{signup key}`, in my section:**
  - Admins and the event's leaders write, for a sign-up that really is for
    that event, in their own name, at the server's time.
  - The key-holder reads their own. Admins and leaders list. Nobody
    deletes.
  - **Not deployed.**

**Proved:**
- `pay-on-day.test.mjs` 18/18.
- `public-mail.test.mjs` 42/42 (the email says £12.00 for 2 at £6).
- Rules: 13 new, 1327 in all.
- 7 deliberate breaks, all caught. The one that matters: a payment filed
  against a sign-up to a different event. My first rules test missed it,
  because it used someone who wasn't that event's leader anyway. A sharper
  check (an admin, so only the "same event" test refuses it) now catches
  it.

### F-184 — "Sign up to the whole series" now works (closes F-030)
Since Chunk 2, the events page offered "Sign up to: the whole series", but
nothing read it (F-030). Now it does:
- **The sign-up page** says "This signs you up to all 4 dates", lists them,
  and the button reads "Sign up to all 4 dates". What to pay counts every
  date.
- **One press, one write:**
  - a sign-up for every date, each with its own key and its own place on
    that date's counter
  - **a date that is already full puts them on its waiting list**, and the
    thank-you says how many were full
  - the door, the registers and cancelling one date all work exactly as
    for a single date
- **One email, not four** (`functions/public-mail.js`, which needs Martin's
  functions deploy). It comes from the first date, lists every date (and
  any on the waiting list), and gives what to pay for the dates with
  places.
- **"My place"** lists every date in the booking, with a link to each
  date's own page (and its own check-in code), and **"Cancel all
  remaining dates"**, which gives every place back.
- **A bug fixed on the way:** when a repeating event was made, its later
  dates got **no ticket types and no questions**, so they were free and
  asked nothing. Now every date gets the first date's tickets and
  questions, under the same ids.
- **New rule `seriesSignups/{signup key}`, in my section:**
  - It can only be made in the same write as its own new sign-up, and must
    match it.
  - Read by the key-holder; listed by admins; never changed.
  - **Not deployed.**

**Proved:**
- `series.test.mjs` 15/15. An admin makes a 4-date series with a £3
  ticket through the real page; a guest signs up 2 people to all 4 (one
  date full); then "Cancel all".
- `public-mail.test.mjs` 45/45: one email for the booking, the second date
  sends nothing, £6.00 for the one date with a place.
- Rules: 5 new, 1332 in all.
- 7 deliberate breaks, all caught. The one that matters: a full date booked
  anyway. The database itself refuses that too.

### F-185 — Name labels for an event's people, adults too; one label size for the church
Martin: adult name labels "should be able to be".
- **At the door** (checkin.html, for admins and the event's leaders), a
  **"Name labels"** button:
  - Everyone booked, or only those here now.
  - Optionally the event's name and date.
  - One label per person, in name order. Only the labels go to the
    printer.
- **One label size for the whole church** (`labelSettings/main`, new file
  `egbc-labels.js`). The children's labels at Sunday check-in and events'
  name labels use the same size, so one printer and one roll do both.
  Sizes:
  - plain paper (as before, and the default)
  - Brother small roll 62 × 29 mm (ChurchSuite's default)
  - Brother 62 × 100 mm
  - Dymo 89 × 36 mm
  - A4 sheets of 21 and of 8
- **Who chooses:** an admin, in Kids Church settings. The door says which
  size it will print on.
- **On a roll,** each label is its own page, and text is sized to the
  label. On a label too small for it, the family QR on the parent's slip
  is left off; the family code is still printed in words.
- **New rule `labelSettings`, in my section:** anyone active reads; an
  admin writes one of the known sizes, in their own name. **Not
  deployed.**

**Proved:**
- `name-labels.test.mjs` 14/14. A leader prints 3 labels; printed, each is
  exactly 62 × 29 mm and nothing else on the page prints; "here now" gives
  1; an A4 sheet of 21 lays them three across at 63.5 × 38.1 mm; an admin
  changes the size and the leader can't.
- `k2-sunday.test.mjs` 39/39: the children's labels print at 62 × 29 mm.
- f098-screen 34/34, e1-checkin 52/52 unchanged.
- Rules: 6 new, 1338 in all.
- 5 deliberate breaks, all caught. The one that matters: the door printing
  on plain paper whatever the church chose.

### F-186 — Several events at once (ChurchSuite's batch actions)
On the events list, every event has a tick box, plus "Choose all". Once
something is ticked, a bar shows "N chosen" with:
- **Change:** category, status (confirmed / not public yet / cancelled)
  and who can come. "Who can come" also changes **who can read** the
  event (its audience), exactly as editing one does; the database refuses
  anything else. Each event records "Changed with others" in its history.
- **Cancelling several** does what cancelling one does: rooms given back,
  and **everyone signed up is emailed**. It asks first.
- **Delete:** each one is recorded in "Deleted events" first (F-180), its
  rooms are given back, then it is deleted. It asks first. Sign-ups are
  kept.
- **Download:** a spreadsheet (CSV) of the ticked events: title, start,
  end, category, status, who can come (in words), where, sign-ups, places,
  series.
- A non-master admin can only change events they may edit. If one is
  refused, it stops and says how many were done.

**Proved:**
- `bulk.test.mjs` 14/14, including choose-all at 375px.
- r3-event-rooms 20/20, parity 36/36, public-whatson 24/24, unchanged.
  r3-event-rooms first went red, because it opens an event by the first
  element carrying its id, which was my tick box. The tick boxes now carry
  `data-pick`, not `data-id`, so nothing mistakes them for "open".
- 5 deliberate breaks, all caught. The one that matters: "who can come"
  changed but not who can read the event.

### F-187 — Invitations (ChurchSuite's event invitations)
A new **"Invitations"** tab on each event in events-admin.
- **Invite** chosen people (from the address book), a whole team, or a
  small group (its members).
  - Each person gets **their own email**, so nobody sees who else was
    asked.
  - It has the event, the admin's own message, and two buttons: **"Sign
    up"** and **"I can't come"**, each carrying that person's own key.
  - Someone with no email address is counted ("1 had no email address"),
    not lost.
  - Someone already invited isn't asked twice.
- **"Sign up" from the email** fills in their name and email. Signing up
  marks the invitation **Coming**, with the sign-up it led to.
- **"I can't come"** thanks them, marks it **Can't come**, and still
  lets them sign up if that changes.
- **The list:** "4 invited · 1 coming · 1 can't come · 2 no reply yet",
  and each person's reply. Someone who signed up without using the link
  still counts as coming.
- **"Remind the N who have not replied"** goes only to them.
- **New rule `eventInvites/{key}`, in my section:**
  - Admins create, list and delete.
  - The key-holder reads theirs and may answer it (yes / no, at the
    server's time, and the sign-up key) and change nothing else.
  - **Not deployed.**
- For a members-only event, the person must sign in to sign up, as always.
- A whole small group can be invited only by the groups admins and its
  leaders. Anyone else is told so.

**Proved:**
- `invites.test.mjs` 15/15. Other tests still pass: series 15/15,
  pay-on-day 18/18, who-can-come 15/15; rules 1338/1338.
- 6 deliberate breaks, all caught. The one that matters: one email to
  everyone, so each sees who else was asked.
  - My first key check let one break through. It only changed the name,
    so it was refused for a different reason. It now gives a proper answer
    and a new name together, which only the "answer only" rule refuses.

### F-188 — Checklists at least as good as ChurchSuite's; and the four confirmations
**Checklists, compared:**

| ChurchSuite | The hub now |
|---|---|
| Tasks on an event, ticked off with who and when | Same (as before) |
| Assigned to a person, who is told | Same. Who (from the address book) is told by email once; changing the task doesn't email them again |
| Due a set time before the event | Same. "On the day", "2 days before", "1 week before"… worked out from the event's date, so a template fits any date |
| Templates | Same, and they keep who, when and the note |
| A default checklist for a category | Same. Tick "Start every new Social event with it" when saving a template; every new event in that category, including every date of a new series, starts with it |
| Reminder emails as a task falls due | **Not yet.** It needs a scheduled server job: request **R11** |
| (not in ChurchSuite) | **Better:** overdue in red; "2 of 5 done · 1 overdue"; move tasks up and down; change a task; a note on each; **"Your tasks"** at the top of Events, which lists the tasks given to you on coming events, overdue first, with "Open" going straight to that event's checklist |

On a phone each task wraps: the task across the top, then who, when and
the buttons.

**The four Martin asked me to confirm:**
- **Sign up to the whole series:** built today, F-184 (it had been offered
  but did nothing, F-030).
- **Letting people cancel:** covered. "People may cancel their own place"
  on each event; the confirmation email's "View or cancel your place"
  button; whole-series bookings can "Cancel all" (F-184).
- **Pay-on-arrival tickets:** built today, F-183. Before, the price showed
  and nothing else.
- **Sharing an event to social media:**
  - On a phone, the share button opens the phone's own share menu, which
    reaches Facebook and everything else.
  - **Added today:** on the event's own page (signup.html), **Facebook, X
    and Email** links, so a computer can share too. Only for public
    events: a members' event's link means nothing to the public.
  - The WhatsApp share is the main window's `egbc-share.js`, unchanged.

**REQUEST for the main window: R11.** A daily job (alongside the rota
reminders) that emails each checklist task's person the day before it is
due, and again if it goes overdue, unless it's ticked.
- `eventChecklists/{calEventId}` holds `tasks[]`, each `{ text, who (a
  memberId), whoName, dueDays, note, done }`.
- It also holds `assignees` (memberIds), `startUtc` and `title`.
- The due day is the event's day minus `dueDays`.

**Proved:**
- `checklist.test.mjs` 16/16.
- `parity.test.mjs` 38/38 (with the sharing checks).
- bulk 14/14, invites 15/15, series 15/15, r3-event-rooms 20/20,
  unchanged.
- 7 deliberate breaks, all caught. The one that matters: an overdue task
  not shown as overdue in "Your tasks".

### F-189 — kids-today.test follows 1034f3f5 (app's "Show on screen" switched off)
- The test now checks there is **no** "Show on screen" button, and that
  **nothing is written to `screenPages`**, least of all the collection code.
- When the main window re-adds the button the F-175 way, the check
  becomes: the screen number, never the code or the name.
- One line was stale since my own F-175 wording ("Ring them instead.").
- 20/20.

**F-180's MISSING list, checked again:** nothing marked MISSING is left
that is mine.
- Event categories: built (F-180).
- Card payments: waits for Martin's provider (F-181).
- The calendar feed: R7 (spec F-182). Its page side is mine, once the
  function exists.
- Everything else (rotas, texts, My details, the directory, My messages,
  the church-wide communication list, team addresses) is the main
  window's, R1 to R11.

### F-190 — Safeguarding settings: set the lead and deputy there (Martin pressed "Set one" and found no way)
- A new card, **"Who looks after safeguarding"**, at the top of
  safeguarding-settings.html. For each building it has **Safeguarding
  lead** and **Deputy** pickers, and with more than one building, which
  building's lead the forms reach first. There's also the lead's phone
  number for the "I'm worried" form.
- **Adults only:** anyone marked **UNDER 16** in the address book isn't
  offered. The address book has no other age, so a 16- or 17-year-old not
  marked is still offered.
- **Saving writes `bookingSettings/<site>.safeguardingLead` /
  `safeguardingDeputy`** (the same fields Places shows, so both pages
  agree), and `safeguardingSettings/defaults.leadSiteId`, `leadName` and
  `leadPhone`. The server's own trigger then sets `careRouting/status`
  (`leadSet: true`).
- The lead and the deputy can't be the same person.
- **A bug fixed:** saving this page used to drop `leadSiteId`, `leadName`
  and `leadPhone` (it wrote the whole document without them). Now they are
  always kept, including when the lead (not an admin) saves.
- **The lead, not an admin,** sees who the lead is and can't change it
  (only admins may write `bookingSettings`, as before).
- **The hub's "Set one"** goes to safeguarding-settings.html again.
  - I changed one line of `hub-app.js` (yours), as asked, and bumped its
    `?v=` in `hub.html` so browsers fetch it.

**Proved:**
- `sg-lead.test.mjs` 14/14, with the hub's **real** functions on the
  emulator (`careStatusFromSite` sets `leadSet: true`).
- 4 deliberate breaks, all caught. The one that matters: the lead saved
  somewhere Places and the server don't read.
  - My first check let "dropping the lead on save" through, because as an
    admin the card re-supplies it. The test now saves as the lead too.

### F-191 — Card payments, built: each church's OWN Stripe account (F-181), on the emulator with a stand-in Stripe
**For the treasurer: `payments.html` (new, mine).**
- The Stripe card has a step-by-step guide:
  - make a **restricted key** with only the permissions listed
  - paste it
  - add the **webhook** at the address shown
  - paste its signing secret
  - choose which tickets take card
  - refund in Stripe's own dashboard
- There's a box for a screenshot at each step. It shows "Picture to come"
  until someone with a test account takes them (F-181 question 2); they
  go in `screenshots/payments/`.
- **"Check and save":**
  - the key goes once to the server (`paymentsSave`)
  - the server asks Stripe (`GET /v1/account`) whether it works
  - only then is it kept, in `paymentSecrets/stripe`, which the rules
    refuse to everyone, master admins included
- **The page then shows** "Connected: <the account's name>, account
  …1234, test (no real money) / live (real money). Added by … on …".
  The key itself never comes back. **Replace** (paste a new one) and
  **Remove** (asks first).
- **Card payment is offered only once both the key and the webhook are
  set.**
- **Who:** master admins, and the money team, "Finance" unless a master
  admin names another (`paymentsTeam`). The server checks every call.

**Tickets** (events-admin): each ticket type has **"How people can pay":
On the day / Card, online**. Card can only be ticked once the church is
connected; until then the page points to Payments.

**Paying** (signup.html, my-signup.html):
- "To pay: £12.00, by card online straight after you sign up" (or "…or at
  the door on the day" when both are allowed).
- After signing up: "Pay £12.00 by card", and "Your place is held for 30
  minutes".
- `ticketPay` works out the price **on the server** from the event's own
  ticket types (a whole series: every date with a place). It makes a
  Stripe Checkout page **with the church's own key**, expiring in 31
  minutes, Stripe's shortest.
- **No fee:** no application fee, `transfer_data` or `on_behalf_of`, ever.
- "My place" shows:
  - "To pay … Pay £12.00 by card" while held
  - "Confirming your payment" on the way back from Stripe, until Stripe's
    message lands
  - "Paid £12.00 by card"
  - "Refunded £12.00"
- **Events › Who is coming:** "Paid £12.00 by card", "waiting for card
  payment", "Refunded £12.00".

**Stripe's messages (`stripeWebhook`):**
- **Checked:** the `Stripe-Signature` HMAC-SHA256 over `t.body` with the
  church's `whsec_`, at most 5 minutes old. One for another account is
  ignored.
- **Acted on once:** each event is marked done in `paymentEvents` only
  after it has been handled, so a failure is retried by Stripe, not lost.
- **The events:**
  - `checkout.session.completed`: paid
  - `checkout.session.expired`: the booking cancelled and its place given
    back
  - `charge.refunded`: refunded or part refunded
  - `charge.dispute.created`: disputed

**Files and lines outside my own:**
- `functions/payments.js` is new, mine.
- One line in `functions/index.js`: `export * from './payments.js'`, the
  way `public-mail.js` is exported.
- Each function names its region (`europe-west2`) itself. Without that
  they came up in us-central1, because `index.js` sets the region only
  after my file has been read.
- No new packages: plain `fetch`, and the signature check written out.

**Rules (my section):**
- `paymentSecrets` and `paymentEvents`: nobody.
- `paymentSettings`: `public` for everyone, the rest for admins and the
  money team; written by the server only.
- A page still cannot mark a place "paid by card online".
- **Not deployed.**

**Proved:**
- `stripe.test.mjs` 32/32, with the hub's real functions and a stand-in
  Stripe on this machine:
  - not a key, and a key Stripe refuses, are both turned away in words
  - the right key gives "Connected …1234, test"
  - the key is nowhere a page can read
  - the money team may set it up; anyone else is refused
  - 2 × £6 = 1200p, worked out on the server
  - Stripe's own page; the place held
  - forged, hour-old and other-account messages are refused or ignored;
    the real one marks it paid, and a repeat acts once
  - unpaid in time, the place goes back
  - refunded shows as refunded
  - removed: card is no longer offered
- Rules: 10 new, 1348 in all.
- 8 deliberate breaks, all caught. The one that matters: Stripe's messages
  believed without checking the signature.

**To go live:** Martin deploys `functions:hub` and, at switch-over, the
rules. Each church then follows the guide on the Payments page. No HQ
account is needed.

### F-192 — Bank payments and Direct Debit giving, built: each church's OWN GoCardless account (F-181)
The same pattern as Stripe (F-191). New file `functions/gocardless.js`
(mine), and one more line in `functions/index.js` (`export * from
'./gocardless.js'`).

**The Payments page** gets a GoCardless card:
- the guide: make a read-write **access token**; paste it; add a
  **webhook endpoint** at the address shown; paste its secret
- the token is **checked with GoCardless** (`GET /creditors`) before it's
  kept
- it then shows "Connected: <name>, account …1234, test / live"
- Remove; neither the token nor the secret ever comes back
- `sandbox_` tokens use GoCardless's sandbox; `live_` tokens the real one

**Tickets: on the day / card / bank, any mix.**
- "Bank, online" is now on each ticket type (`payBy`), offered once the
  church is connected.
- Paying by bank is **Instant Bank Pay**: a GoCardless Billing Request with
  a payment request, on GoCardless's own page. **The price is worked out
  on the server.**
- Paid when GoCardless says the request is fulfilled: "Paid £8.00 by bank"
  on "my place" and in Events.
- A failed payment gives the place back.
- **Not paid in 30 minutes, the place goes back.** GoCardless doesn't
  expire its pages, so `paymentsTidy` does this every 10 minutes.

**Regular giving by Direct Debit** (`give-regularly.html`, new, mine;
signed in or not):
- **The form:** how much; monthly on a chosen day, or every 4 weeks; name
  and email.
- **"Add Gift Aid":** HMRC's words in the church's name, house and
  postcode. It keeps a **Gift Aid declaration** in `giftAid` exactly as
  F-169 does (`source: 'regular-giving'`).
- **Setting up:** the giver sets up the Direct Debit on GoCardless's page
  (a Bacs mandate request). Once GoCardless says the mandate is ready, the
  server starts a **subscription** for that amount and timing.
- **Each collected gift is recorded once** in `donations`, with its amount,
  date and Gift Aid. Refunds and failures are recorded too.
- **The giver's own page** (their key, in their link): amount, how often,
  Gift Aid, running or not; **Change the amount** (GoCardless is told);
  **Stop my gift** (the subscription is cancelled).
- **The treasurer** (Payments › Regular giving):
  - how many are running, and about how much a month
  - "Download the Gift Aid gifts (CSV)": first name, last name, house,
    postcode, date, amount; what the HMRC claim needs, beside the
    declarations on the Gift Aid page
- **New rules (my section):**
  - `regularGifts`: the giver by key; listed by the treasurer and the
    office (`giftAidOffice`)
  - `donations`: the same people
  - both server-written only
  - **Not deployed.**

**No fee:** no `app_fee` anywhere; the test reads every request.

**Proved:**
- `gocardless.test.mjs` 33/33, with the hub's real functions and a
  stand-in GoCardless on this machine:
  - not a token, and a wrong token, refused; the right one connected; the
    token and secret never come back
  - "on the day or by bank"; Instant Bank Pay at the server's 800p; a
    forged message refused; paid
  - unpaid after 30 minutes, the place goes back
  - £20 monthly on the 1st with Gift Aid: the declaration kept, then the
    subscription started on the mandate
  - a gift recorded once
  - changed to £25; stopped
  - the treasurer's summary and Gift Aid CSV
  - nobody else reads the gifts
  - removed: nothing offered
- `stripe.test.mjs` still 32/32; rules 1355/1355 (7 new).
- 8 deliberate breaks, all caught. The one that matters: GoCardless's
  messages believed without checking the signature.

**REQUEST for the main window:** the Give screen (`give.html`, yours)
needs one link, **"Give regularly by Direct Debit" → give-regularly.html**,
shown when `paymentSettings/public.bank` is true. Or tell me to add it.

### F-193 — R7 built: the What's on calendar people subscribe to, that works (spec F-182)
New file `functions/events-feed.js` (mine), exported from `index.js`.
- **`eventsFeed`** (public HTTPS, no sign-in, as `rotaFeed`):
  - `?church=1`: public events only
  - `?k=<key>`: what that person may see (public, attenders', church
    members' if they are one, their teams' and the teams they lead)
  - `&cat=a,b`: just those categories, named in the calendar's title
  - **Never** a not-listed, not-yet-public or other team's event. A person
    whose account has gone gets nothing.
- **To the letter:**
  - a `VTIMEZONE` for Europe/London (Outlook drops a feed without one)
  - times in London wall time, the night the clocks change included
  - all-day dates end the day after
  - one `UID` per date (`<calEventId>@<hub host>`), never changed
  - CRLF line ends
  - lines folded at **75 bytes without splitting a letter** (the rota
    feed folds by characters, which an accented name would break)
  - cancelled dates kept as `STATUS:CANCELLED`
  - `SEQUENCE` / `LAST-MODIFIED` from `updatedAt`
  - from 30 days ago to 18 months ahead
  - cached 15 minutes
- **`myEventsFeed`** (callable): the signed-in person's own link, made once.
  **Reset** makes a new one, and the old one stops at once. Keys are in
  `eventFeeds`, which no page may read or write (new rule, my section;
  **not deployed**).
- **What's on › Subscribe:**
  - public events only, or "Everything I can see here (my own link)"
  - which categories (none ticked: everything)
  - **Add to Google Calendar** (`calendar.google.com/calendar/r?cid=webcal://…`)
  - **Apple or Outlook** (`webcal://`)
  - **Copy the link**
  - Reset
  - It says Google can take a few hours to catch up, which is Google.
- **What it can't prove here:** that Google, Apple and Outlook each accept
  it. No real calendar app can reach the emulator. The test reads the feed
  with a strict reader of its own. Once deployed, a person adds the link in
  each app once.

**Proved:**
- `events-feed.test.mjs` 18/18, with the hub's real functions.
- Rules 1358/1358 (3 new).
- 7 deliberate breaks, all caught. The one that matters: members' and team
  events reaching the public feed.

### F-194 — R11 built: checklist reminders as a task falls due
New file `functions/checklist-reminders.js` (mine), exported from
`index.js`. **`checklistReminders`** runs every morning at 8, London time.
- **Who gets an email:** each checklist task with a person named and a due
  date (days before its event), not ticked, on a coming event that isn't
  cancelled:
  - **the day before** it is due: "Due tomorrow: Chairs out (Harvest
    supper)", with the task, the note, the date and the event
  - **the day after** it was due: "Overdue: …"
- **Each is sent once.** The record is `checklistReminders/{event}_{task}_{kind}`.
  The task's id is its words, who and when, so moving it up the list
  doesn't send again.
- Someone with no email address is recorded, not lost.
- **Dates are London dates:** the event's own day, minus the task's days.
- Tasks are found by their **events'** own dates, so a moved event moves
  its reminders.
- Sent through the hub's own sender (`makeSender`, as F-170), so each
  lands in `emailOutbox` like every other server email.
- **New rule `checklistReminders`:** nobody (my section). **Not deployed.**

**Proved:**
- `checklist-reminders.test.mjs` 11/11. The job is run on chosen days,
  through a stand-in sender that only records.
- Rules 1360/1360 (2 new).
- 6 deliberate breaks, all caught. The one that matters: reminders sent
  again every morning.
  - My first London-date check let "dates in UTC" through, because every
    time I'd chosen fell on the same date in both. It now also runs at
    23:30 UTC on Friday 23 October, which is already Saturday in London.

### F-195 — R8 built: every email the church sent, and the ones that failed
ChurchSuite's "Communication" and "Email errors" reports, for the whole
church rather than one event at a time.
- **`comms.html`** (new, mine; admins; "Emails sent" on the Events page):
  - the last week / 30 days / 3 months, newest first
  - each email in plain words ("Sign-up confirmation", "Booking: waiting
    for approval", "Event cancelled: Quiz night"), its subject, who to
    ("pat@… and 1 more", or "12 people"), who sent it (the hub, or the
    admin), and **Sent / Not sent (test) / Failed, and why**
  - "5 emails to 18 people in the last 30 days. 3 failed."
  - **"Only the ones that failed"**: the email errors report
  - **Download** (CSV), named "Email errors" when filtered
- **Two sources, put together:**
  - **The server's own emails** come from `emailOutbox` through a new
    callable, `commsReport` (`functions/comms.js`, mine, exported from
    `index.js`; admins only). Outbox rows hold whole emails, some with
    private links (a booking's key), so no page may read `emailOutbox`.
    The function hands over **the outline only**: when, who to, subject,
    what kind, result, error. Never the email, its attachments or links.
  - **Emails pages sent** (an event's "Email everyone", cancellations,
    invitations, checklist tasks) come from `commsLog`, which admins
    already read.
- **What isn't in it:** phone notifications (pushes); those are the main
  window's `notifyLog`. Rota emails sent from the Calla project's
  `sendEmail` also aren't here, because they aren't logged in this
  database.

**Proved:**
- `comms.test.mjs` 10/10, with the hub's real functions.
- 5 deliberate breaks, all caught. The one that matters: the whole email,
  private links and all, handed to the page.

### F-196 — Payments shut until switch-over: what people see (after bcbe6d7e)

The reviewing window shut payments on the live site (`payments-gate.js`,
`PAYMENTS_LIVE = false`). The pages now say so in plain words.

- **The words:** "Online payments open when the church switches over."
  They appear on:
  - the Payments page: "Check and save" (Remove is not shut, so it still works)
  - the pay buttons straight after signing up (card and bank)
  - the pay buttons on "my place" (card and bank)
  - Give regularly: set up, change and stop
- **How a page knows it is the gate.** The gate's refusals now carry a
  mark, `{ shut: true }` (`payments.js`, `gocardless.js`). The server
  has other failed-precondition refusals with useful words of their own,
  for example "This ticket is not paid by card" or "This gift is not
  running". Those keep their own words. Only the gate's refusal gets the
  switch-over words.
  - `E.callPublic` now carries the code and the mark.
  - `EGBCAuth.call` (main window's) keeps the code but not the mark, so
    `E.paymentsClosed` also accepts failed-precondition plus the gate's
    own "switches over" words. The Payments page relies on that.
  - One helper, `E.payProblem(e)`, used by all four pages.
- **A switch for the tests, emulator only.** The emulator never runs
  shut, so `paymentSecrets/config.shutForTest` makes the callables refuse
  as the live site does now. It is read only when `FUNCTIONS_EMULATOR`
  is true, in the same way `stripeApi` is. `payments-gate.js` is
  untouched. The live site goes on deciding by `PAYMENTS_LIVE` alone.
- `egbc-events.js?v=202610151000` on every page that loads it, except
  app.html (main window's; still 202610101800, as asked before).

**Proved:**
- `payments-shut.test.mjs` 11/11, with the real functions.
- 7 deliberate breaks (see the report). The one that matters: the
  Payments page showing the server's own long words.

### F-197 — Subscribe from a phone (Martin: "there is no link to that calendar from the phone")

- **One Subscribe card, shared.** It now lives in `egbc-events.js`
  (`feedUrl`, `isPhone`, `subscribeHtml`, `subscribeAct`). Both
  whatson.html and the app's What's on draw it, so they can't drift apart.
- **On a phone** (an iPhone, iPad or Android browser):
  - one big button, **"Add to my phone's calendar"**, the full width of
    the card. It opens the `webcal://` link: iPhone's Calendar asks
    "Subscribe?"; on Android, whichever calendar app takes webcal.
  - under it: "iPhone: tap Subscribe when it asks. Android: if nothing
    opens, use Google Calendar below, or copy the link."
  - **Google Calendar** and **Copy the link**. After copying it says how
    to use it: "In Google Calendar on a computer: Other calendars, +,
    From URL, then paste it." (Google's phone app can't add a calendar
    from a link; only the website can.)
- **On a computer:** as before: Add to Google Calendar, Apple or Outlook,
  Copy the link.
- **Public events or "my own link"**, and the categories, as before.
- **The app's What's on** (`egbc-app-whatson.js`, events window): a new
  row, "Add What's on to my phone's calendar", opens the card. It
  replaces the old line "Calendar: add your rota and events to your
  phone's calendar from Me".
- **The hub's What's on on a phone** is whatson.html, which already had
  Subscribe; it now shows the big button there too.
- `egbc-events.js?v=202610151200` on my pages.

**Waiting on the main window (app.html):** two ?v= bumps, so phones get
the new files:
`egbc-events.js?v=202610151200` (now 202610101800) and
`egbc-app-whatson.js?v=202610151200` (now 202610101800). The request
named app.html, but the safety check on this machine stopped me editing
a main-window file, so it's listed here for whoever does.

**Not proved here: the hand-off itself.** A test can check the link and
that the calendar behind it is real, but not iPhone's "Subscribe to
calendar?" or Android's choice of app. That needs a real phone with
Martin (see the report for the steps).

**Proved:** `phone-subscribe.test.mjs` 14/14, at 375px, with an iPhone's
and an Android's browser names and the hub's real functions.

### F-198 — Subscribe on Android (Martin's phone); the k3 register; the phone-subscribe flake

**Android** (Martin, 15 Oct: "Add to my phone's calendar" seemed to work,
but no calendar appeared. Android has no webcal handler, and Google
Calendar and Outlook can't subscribe from a link on the phone.)
- The card now tells iPhone, Android and computers apart.
- **Android, first thing in the card:** "Everything coming up is always
  in What's on in this app." (on whatson.html: "...always here, in
  What's on."). Underneath, as optional: "Also in Google Calendar or
  Outlook (optional)", "add it once on a computer and it appears on your
  phone", a big Copy, "Email me the link", the Google steps
  (calendar.google.com > Other calendars + > From URL), the Outlook steps
  (outlook.com > Add calendar > Subscribe from web), and "Then on your
  phone: Google Calendar > Settings > the new calendar > Sync on".
- No webcal button on Android. No second app needed. The one-off .ics
  download is never offered as "subscribe".
- **iPhone:** keeps the big webcal button (Martin: fine). **Computers:**
  as before.
- **Email me the link:** a new callable, `emailMyFeedLink`
  (`functions/events-feed.js`, mine). It sends only to the signed-in
  person's own address on their account; nothing in the request can
  change who it goes to. The server builds the link itself (their own
  link when they chose it). 5 an hour at most. Signed out: refused, and
  the button isn't shown. Logged in emailOutbox; Emails sent calls it
  "Calendar link (to themselves)". Rules: `feedLinkSent` has no rule, so
  only the server can touch it.

**The phone-subscribe flake (test 5).** `EGBCAuth.call` uses the current
user straight away; just after a page opens the sign-in hasn't settled,
so "my own link" failed quietly. The card now waits for the sign-in
before any call. The test asks the moment the app opens, and passes.

**k3-morning ("the date").** The register drew twice when the period
changed ("This term", then "Choose the dates"), and the slower, longer
load landed last, showing 3/9 to 15/10 instead of 1/10 to 15/10. Only
the latest draw may fill the table now. It depended on how many weeks
the term had so far, which is why it looked like a date fault. The other
k3 check ("ask the office") failed once and passed 5 times since; the
test now prints what the page showed if it ever fails again.

**Proved:** phone-subscribe.test 27/27, k3-morning 31/31 (5 runs).
6 deliberate breaks, all caught. The one that matters: Android getting
the webcal button again.

### F-199 — Event pictures in the app and on a phone

Martin, 15 Oct: "the pictures are not showing against the events on the
phone app. Just a date card."
- **The app's What's on** (`egbc-app-whatson.js`):
  - list: an event with a picture shows it as a 56px rounded square,
    cropped to fit, where the icon was; others keep the icon
  - the event's own view: the picture as a banner at the top, at most
    200px tall, cropped to fit; tap it to see the whole picture
- **whatson.html on a phone** hid pictures entirely (a rule below 420px).
  Now the picture takes the date card's place (56px); events without one
  keep the date card; the date is in the line under the title anyway.
  Computers: as before.
- Only a web address is drawn as a picture. whatson.html used to draw
  any address, which showed a broken picture.
- **Other places in the app:** Home shows no event cards (the hub's Home
  has the Watch card; the app's Home is rotas). Nothing for the main
  window.
- **app.html (main window's):** please bump `egbc-app-whatson.js` and
  `egbc-events.js` to `?v=202610151500`.

**Proved:** app-pictures.test 13/13 at 375px; app-whatson.test 15/15.

### F-200 — After da5cc4af (Payments and Emails sent: only the right people)

- **comms.test** reran: 14/14. It now also proves that an admin for one
  team (not a master admin) is turned away by the server and the page.
- **events-admin.html** showed an "Emails sent" button to every events
  admin. It now shows only for master admins (comms.test checks both).
- **check-menu: not run by me.** It needs the main window's emulators
  (9099), and another window was running check-menu at the time, on its
  own ports. Running it alongside would have clashed and written into
  their emulator. Please run it there.
- **The money team's name in the Menu.** `paymentsTeam` now also writes
  the team's NAME (only the name, not who is on it) to
  `paymentSettings/public.moneyTeam`, which anyone may read. The team
  record itself stays private (stripe.test checks both). For the main
  window, in egbc-menu.js, the cheap way is one read before deciding
  Payments:

      db.collection('paymentSettings').doc('public').get()
        .then(s => (s.exists && s.data().moneyTeam) || 'Finance')
      // then: show Payments if masterAdmin, or teams includes that name

  Until a master admin renames the team, moneyTeam is absent: 'Finance'.
- stripe.test 34/34, gocardless.test 33/33.

**F-199, changed the same day (Martin, 15 Oct): the WHOLE picture.** The
event page cropped the picture as a wide banner and cut off the
Bereavement Cafe poster's times. "It needs the full image when you open
it, without making the page too big."
- One shared piece in egbc-events.js (`picFigure`, `picOpen`, `safePic`),
  used by the event page and the app's event view.
- **Phone:** the whole picture (never cropped), at most half the screen
  tall, centred on a blurred, darkened copy of itself filling the width;
  the details start straight underneath.
- **Computer (900px and wider):** two columns: the picture on the left at
  its own shape (35%, at most 70% of the screen tall), the title, details,
  buttons, description and sign-up on the right.
- **Tap or click it:** full screen, the whole picture on dark; X and Esc
  close it, and the focus goes back to the picture.
- No picture: the page as before.
- The app's separate "whole picture" page is gone; it uses the same full
  screen view.
- Screenshots: signup-picture-bereavement / -film at 375 and 1440,
  app-pictures-event-375, app-pictures-full-375.

**Proved:** app-pictures.test 26/26. 7 deliberate breaks, all caught; the
one that matters: the picture cropped as a banner again. The event page's
other tests still pass: pay-on-day 18, series 15, invites 15, stripe 34,
events-feed 18, phone-subscribe 27.

### F-201 — "My usual people": remember who I usually sign up (usualPeople)

Martin, 15 Oct: "I really like that you can open the event and sign up
easily - a big improvement over ChurchSuite." Then: remember who I
usually sign up. For any church; feature name **usualPeople** (rule 12).

**Signed in** (`egbc-events-usual.js`, new, mine; signup.html):
- At the top of the form: **"Same as last time: Martin, Natasha and
  Daniel"**, from the person's own most recent sign-up. One tap fills
  the names, the ticket (matched by its name, since each event has its
  own tickets) and the answers (matched by question). Everything stays
  editable.
- **Answers from last time are marked** in gold: "From last time: please
  check it is still right." If any health answer (allergies, medical,
  dietary and similar) was filled in, a tick just above Sign up must be
  ticked first: "I have checked the health answers...". Without it,
  nothing is sent.
- **A health answer older than six months is not filled in at all.**
  Other answers are.
- **Household tick boxes:** the person, then their household's first
  names (the main window's `myFamily`, which gives first names only). A
  box counts as ticked when the form already has that person, by full or
  first name.
- **Names from their own past sign-ups offered as they type** (a list on
  each name box).
- **"My usual people"** on my place (my-signup.html, signed in): each
  name with Remove; removed names under "Taken off" with Put back.
  Stored in `signupUsual/{uid}.hidden`.

**Only their own.** Names come only from sign-ups with their own
memberUid, through the existing signups list rule, so nobody else's can
come back. New rule (events section): `signupUsual/{uid}`, read and
write only by that uid, an admin included; only `hidden` (at most 200
names) and `updatedAt`.

**Signed out:** the last sign-up's NAMES only, on that device only
(localStorage `egbc_usual_v1`, inside try/catch), with **"Not you?
Clear"**. No email, no answers, nothing on the server.

**No new emails:** this only fills in the form. The one confirmation
still goes to the person signing up, nobody added (as always, never to
under-18s).

**Proved:** usual-people.test 28/28 at 375px, with the real functions.
7 deliberate breaks, all caught. The one that matters: the rule opened
so anyone can read anyone's list. The sign-up page's other tests: pay-on-day
18, series 15, invites 15, stripe 34, app-pictures 26.

### F-202 — Regular giving: the giver chooses how often (Martin, 15 Oct)

Martin's answers to the F-181 defaults: the treasurer is master admins
plus the Finance team (as built); "Give regularly" on the Give screen is
the main window's link (as asked).

**How often:** the giver chooses **Monthly** (with the day) or **Every
4 weeks** (GoCardless monthly, or weekly x4).
- **The form** asks "How often?": Monthly / Every 4 weeks.
- **The email** (new: there was none): "Your regular gift is set up",
  sent when GoCardless confirms the Direct Debit, to the address the
  giver gave and nobody else: "£20.00 monthly, on the 1st of the month,
  by Direct Debit, with Gift Aid", and the link to change it.
- **Their page:** "£20.00 monthly, on the 1st of the month" or "£10.00
  every 4 weeks".
- **Changeable later:** on their page, the amount AND how often (and the
  day). GoCardless can't change how often an existing collection runs,
  so a new one starts on the same mandate (the giver's bank authority,
  nothing to do at their bank) and the old one is cancelled. An email
  says "Your regular gift has changed".
- Emails sent shows them as "Regular gift: set up" / "changed".

**Proved:** gocardless.test 42/42 (was 33): both frequencies from the
start, and a change from monthly to every 4 weeks.

**Seen, not fixed:** gocardless.test failed at three different points in
2 of 6 runs (waiting for the form; the bank pay step; the amount
change), each time while another window was running its own tests; it
passed the other 4 runs, including 2 back to back once things were
quiet. It looks like timing under load. I'm noting it here rather than
hiding it.

### F-203 — Before switch-over: no health answers saved, and no "My usual people" on the server

The reviewing window, 15 Oct: until the locked rules deploy, anybody can
read the live database, and sign-ups save names and answers there.
`egbc-launch.js` (churchSettings/launch.rulesLocked) decides; anything but
exactly true counts as "not yet".

**Until rulesLocked is true:**
- **The sign-up page doesn't ask health questions at all**, even required
  ones, so they can't block a sign-up. Health means the question's
  wording: check-in's medical words (allergy, medical, health,
  condition, asthma, diabetes, epilepsy, EpiPen, disability, additional
  needs, first aid) plus diet, food and intolerance
  (`EGBCEvents.isHealthQuestion`). Leaving out too much is the safe way
  to be wrong.
- In their place: **"Please tell the organiser about any health needs
  (allergies, medical, dietary) directly until 1 November."** (the
  opensOn date; without one, "until the new church hub opens").
- The sign-up still works; other questions are asked and saved. As a
  second guard, health answers are stripped before saving.
- "Same as last time" fills in no health answers, so there's no health
  tick.
- **"My usual people" isn't saved on the server:** no Remove button on
  my place ("You can take names off from 1 November."), and the
  helper itself refuses to write. Signed out, the device-only memory
  carries on.

- **Under "Anything we should know?"** (Martin, 15 Oct): "Please don't put health details here yet - tell the organiser directly until 1 November." (or "until the new church hub opens"), linked to the box for screen readers.

**From rulesLocked true:** everything as F-201.

Only signup.html saves sign-up answers (checked: no other page calls
signUp), so nothing else needed changing. e1-checkin.test now sets the
lock on, because it saves allergy answers.

**Proved:** usual-people.test 36/36: everything with the lock on, then
off (section 12), then on again.

### F-204 — Rotas: ChurchSuite compared with the hub (for the main window)

Read-only, from FINDINGS, the briefs and the code; nothing changed.
Rotas are the main window's. ChurchSuite's side comes from F-180 (Martin's
login, 14 Oct) and EVENTS-BOOKINGS-BRIEF §9. Anything marked **(check)**
I couldn't confirm from those, and the reviewing window may want to look
through Martin's login.

Remember **Martin's decision F-018 (NEXT-BRIEF §10):** "Rota parity: not
wanted ... Do not build accept/decline, swaps, self sign-up, reminders
or clash reports." The day-before reminder was later added for launch
(§26). So below, **Decided** means "different on purpose, don't build".

**Where the hub's rota lives:** Planner.html (computer), egbc-core-rota.js
(the same planner in CoreTeamApp and the app), view-only-rota.html,
egbc-rota-pdf.js, the availability form (index.html + functions
availability-form.js), functions rota-feed.js / notify.js / family.js.
Each service is one `events/{id}` with `roles[]` and
`assignments{role: person | [people]}`.

| ChurchSuite tab / feature | The hub today | Gap |
|---|---|---|
| **ROTAS** | | |
| A rota for each ministry (14 ministries, 10 rotas) | Worship, AV and Core Team (with Kids Church slots on the Sunday) | **MISSING for 7+ rotas** (After Service Prayer, Creche, Flowers, Garden, Lazers Sunday, Police bakes, Preacher/Service Leader, Small Group Leaders, Stewards, Tea & Coffee, Welcome). R1, question 3: which, and when |
| Adding dates (one, or repeating) | "+ Service"; "Populate" a term of Sundays; "Add Practices" (Thursdays); new-event defaults per type | **Partial:** no general repeat (weekly/monthly/nth Sunday) and no editable templates; the roles per type are fixed in code (Planner 38–84) |
| Roles per date; more than one person in a role | roles per event, + / x per event. The data allows a list of people per role | **Partial:** no way on screen to put a second person in one role (numbered slots instead). Where a list does exist, three places only read one person, so the people in it are missed: **the Excel export prints blank, and the day-before reminder and myFamily read `who.id`** (Planner 798; notify.js 357–385; family.js 140). Worth fixing even if lists are never used on screen |
| Notes on a date | one Notes box per event, Service Leader, Speaker | Same |
| Copy a rota / dates | "Sync" copies a Sunday's people to its practice | **MISSING:** copy a date or a term (check if wanted) |
| Draft / publish | team sign-off per term; editing withdraws it; "Send all rotas" waits for every team | Same in effect. `draft` is read by feeds and reminders but no screen sets it: harmless, worth a comment |
| Ministry overseers manage their own rota | each area admin edits only its own slots on the page | **Partial:** the page limits it, **the rules don't**: `events` can be written by any admin or any member of a listed team (firestore.rules 531–533). Worth tightening at switch-over |
| Group email to a rota | "Send all rotas" (PDF + .ics), one person's rota | Same for the rota itself; a free-text email to everyone on a rota: part of "better group emails" (after launch, item 1) |
| Accept / decline | none | **Decided (F-018)**; ChurchSuite had it off anyway |
| Swaps between members | none (the email says "get in touch") | **Decided (F-018)** |
| Members signing up to open dates | none | **Decided (F-018)**; "Fill a rota gap" is after-launch item 4, to discuss with Martin |
| **MEMBERS** | | |
| Who is in each ministry, with their roles | address book markers/teams; instruments and kids roles per person; max serving per month and per team | Same or better |
| Inactive members | address book `archived` | **Gap:** the Planner and core rota lists don't leave out archived people (myFamily does) |
| Team leader shown per ministry | area admins (`adminFor`) | Same in effect; no "leader" label on a team (check if wanted) |
| **SERVICES** (ChurchSuite: none used) | Sunday and youth service planners: order of service, songs and keys, notes per role, linked to that date's rota | Better (not used in ChurchSuite) |
| **MINISTRIES** | teams with a `parent` (e.g. Choir under Worship), `rota: false` for groups without one | Same in effect |
| Per-ministry privacy | Worship and AV see each other's; Youth sees Worship; the rest by team | Same (check ChurchSuite's settings per ministry) |
| **UNAVAILABILITY** | one answer per person per date (available / not), from the availability form; "Gather Avail" asks a term at a time and only re-asks new dates | **Partial:** no date ranges ("away 1–14 Aug"), no repeating ("never the first Sunday"), no reason. **No warning when assigning someone who said they can't** (only labels in the phone view). F-180 called this "Same": it is, for how EGBC uses it, but ranges would save people answering date by date |
| Clashes (one person on two rotas at once) | auto-fill avoids two slots in one event | **Decided (F-018)** for the clash report; but a simple **warning on assigning** someone already on another rota that day would be cheap (check if wanted) |
| **REPORTS** | "Sundays served this month" per person in the Planner | **MISSING (R2):** not on any rota, serving frequency over a period, personal serving history, not in a ministry, unfilled slots (only a green dot when the must-have roles are filled), demographics. Exports: Excel only, no CSV |
| **REMINDERS** | "You are serving tomorrow" at 17:00 London, phone notification or email | Same, except **texts (R3, question 2)** and the time (ChurchSuite 8am; hub 5pm the day before) |
| **MY ROTAS** (volunteers) | next three dates on Home and the app's Rota tab; view-only rota; calendar feeds (me / household / full); family's week; the availability form | Same. "My unavailability" as one list to see and change: **Partial** (the form shows the term's dates) |

**Suggested order, if Martin wants any of it** (none is mine to build):
1. Fix the three places that miss people when a role holds a list
   (export, reminder, myFamily): small, and a reminder silently not sent
   is the worst kind of gap.
2. Tighten the `events` write rule to match the page (an area admin only
   for their own slots) at switch-over.
3. Leave archived people out of the rota lists.
4. A warning (not a block) when assigning someone who said they can't,
   or who is already serving elsewhere that day.
5. R1: more ministries' rotas, starting with whichever Martin names.
6. R2 reports: not on any rota, serving frequency, personal history.
7. Unavailability as date ranges.

### F-205 — R2 built: rota reports (moved from the main window's list)

**rota-reports.html** (new, mine) with **egbc-rota-reports.js** (new,
mine). Read-only, for master admins and the leaders of rota teams.
Feature name **rotaReports**.
- **Unfilled slots** in the dates chosen: date, service, slot, team.
- **How often people serve:** services and slots per person, their teams,
  and when they last served (never a date still to come).
- **One person's serving:** date by date.
- **Not on the rota:** people on a rota team (Choir counts as Worship)
  who weren't on it in those dates. Archived people are left out.
- **CSV download** of each, the same as the screen. A cell starting with
  = + - @ gets a ' in front so a spreadsheet won't run it as a formula.
- **Dates:** three months back to three months ahead to start with; any
  range can be chosen. Practices are left out unless "Include practices"
  is ticked, because a practice copies the Sunday's people and would
  count everyone twice.

**Read as the planners save them:** `events` (date, type, roles,
assignments), skipping archived and draft services. **A role may hold
one person or a list** (F-204's fault): every count reads every person
in it. Whose slot is whose comes from `EGBCAuth.roleTeam`, the Planner's
own answer, not a copy.

**Who sees what:** a master admin sees every team. An area leader
(`adminFor`) sees only the rota teams they lead: Worship, AV or Kids
Church slots and people. Anyone else is turned away. The rules already
allow these reads (events: volunteers; address book: admins). Serving
records only: nothing about who came to church.

**For the main window:** a Menu entry for rota-reports.html (master
admins and rota team leaders), and a link from the Planner if wanted.

**Proved:** rota-reports.test 21/21, including a role holding two people,
an archived service, a practice, a future date, two area leaders and an
attender. The page writes nothing (the services are unchanged after).

### F-206 — R6 built: "My messages" (what the church has sent ME)

ChurchSuite's "My Communication". Moved from the main window's list.
- **my-messages.html** (new, mine): the signed-in person's emails from the
  church's server in the last year, newest first: when, what kind
  ("Sign-up confirmation", "Booking: waiting for approval"...), the
  subject, and "it could not be sent" where it failed.
- **From a new callable, myMessages** (functions/comms.js, mine): it
  reads emailOutbox, which no page may read, and hands back the outline
  only (when, what, subject, whether it went). Never the email, its
  links or attachments, and never who else it went to.
- **Own emails only:** the person's addresses are the one on their record,
  and the one they sign in with if their email provider confirmed it.
  Nothing in the request can change that. Capitals don't matter
  (MARY@... counts as mary@...).
- **Where:** a link on my place (my-signup.html) when signed in, and
  `EGBCEventsHome.myMessages()` for the app's Me tab to draw.
- **Not listed yet:** emails sent through Calla's sendEmail straight from
  pages (rota emails from the Planner, group emails from EmailBuilder2):
  they aren't logged in this database. The page says so.

**For the main window:**
- a row on the app's Me tab: "My messages", drawn from
  `EGBCEventsHome.myMessages()` (or a link to my-messages.html)
- app.html and hub.html: `egbc-events-home.js?v=202610152100`
- if wanted, log the outline of the pages' own sends (rota, group emails)
  to emailOutbox, and they'll appear here and on Emails sent

**Proved:** my-messages.test 14/14 with the hub's real functions.

### F-207 — R9 plan: sending as a team's shared address (PLAN ONLY, for review)

ChurchSuite lets a user group (EGBC: Eldership, Finance, Safeguarding)
have its own shared email address and send as it (F-180, question 9).
Nothing is built yet; this is the plan for the reviewing window and
Martin.

**What can and can't change, with Calla's sendEmail as it is.**
- Every email leaves from **one fixed address**, `EGBCWorship@callasuite.uk`
  (the planners say so: "Sends from EGBCWorship@callasuite.uk - replies go
  to you"). The hub can't make the From line say
  `safeguarding@esherchurch.org`. A real From for each address needs
  Calla's mail service to prove the church owns that address (its
  domain's sending records). That's Calla's to say, not the hub's.
- What sendEmail already takes: `to`, `subject`, `html`, `replyTo`,
  `attachments`. So **"send as a team" here means:**
  1. **Reply-To** is the team's shared address, so replies go to the
     team's mailbox, never to the sender's own and never into the hub.
  2. **The name** the person sees: the subject starts "Safeguarding team:",
     and the email opens and closes as from the team ("From the
     Safeguarding team, Esher Green Baptist Church"). If Calla adds a
     from-name field, the From line can read "Safeguarding team (Esher
     Green Baptist Church)" while the address stays Calla's (question C1).
  3. **A copy to the shared address** (as a separate recipient), so the
     team's mailbox holds everything sent in its name, whoever sent it.

**Which address.** A new record per team, set by a master admin only:
`teamMailboxes/{team}` = { address, displayName, senders: [memberIds],
copyToSelf: true, updatedBy, updatedAt }. Examples: Safeguarding ->
safeguarding@esherchurch.org; Finance -> finance@...; Eldership ->
elders@... These mailboxes (or forwarders) must already exist at the
church's email host; the hub doesn't create them (question M2). For any
church: nothing is built in for EGBC, and a church with no shared
addresses sees nothing new. Feature name **teamMailboxes**.

**Who may send as it.** Default: master admins, and that team's admins
(`adminFor` includes the team). A master admin may add named senders.
**Safeguarding:** only the safeguarding lead and deputies (the settings
F-190 built), not every Safeguarding team admin, unless Martin says
otherwise (question M3).

**How it's sent: through a hub function, never the browser.**
`sendAsTeam` (callable, mine, functions/team-mail.js):
- checks the signed-in person may send as that team, on the server
- sets replyTo to the shared address and adds the copy to it
- sends with the server's identity token, like F-168's emails
- **Recipients:** only people the hub can send to (sendEmail's
  KNOWN_SOURCES and hourly cap still apply). The shared address must
  count as a known recipient for the copy (question C2).
- **Logs** to emailOutbox with `asTeam` and the sender's name, so Emails
  sent shows "Safeguarding team (sent by Sam)". **For Safeguarding, the
  outline only**: no html is kept in the outbox, because a safeguarding
  email may hold sensitive details and the outbox is read by more
  people than the safeguarding team (question M4). "My messages"
  (F-206) shows the recipient the outline as usual.

**Where the choice appears:** a "Send as" picker (Myself / the teams I
may send as) in the hub's email writers:
- events-admin's "Email everyone" (mine)
- the safeguarding pages (mine: a lead writing to a family or a volunteer)
- the main window's EmailBuilder2 (theirs: a request, once this exists)

**Before switch-over:** `teamMailboxes` holds only addresses and names,
nothing private, but it would be writable by anyone until the rules
deploy. So, like payments (F-196): `sendAsTeam` refuses on the live site
until rulesLocked, and the settings card says "Opens when the church
switches over".

**Questions**
- **For Calla:** (C1) can sendEmail take a from-name, so the From line
  can name the team? (C2) does it check replyTo against known addresses,
  and can each team's shared address be added? (C3) is a real From per
  address (domain checks) possible later, and what does the church need
  to do? (C4) is the hourly cap per sender or for the whole church?
- **For Martin:** (M1) which teams need a shared address: Eldership,
  Finance, Safeguarding, others? (M2) do those mailboxes exist already, and
  what are the addresses? (M3) who sends for each (Safeguarding: the lead
  and deputies only?) (M4) keep only the outline of Safeguarding emails
  in the hub (recommended), or the whole email like the rest?
  (M5) the copy to the shared mailbox: yes (recommended)?

**Proposed build, once agreed** (about one job): the teamMailboxes
settings card, the rule (events section), sendAsTeam with its tests
(who may and may not send, the reply-to, the copy, the outline-only log,
refused before switch-over), and the picker in events-admin and
safeguarding. Stopping here for review.

### F-208 — R9 built: sending as a team (Martin's answers, 15 Oct)

As planned in F-207, with Martin's answers and his firm correction on
Safeguarding. Feature name **teamMail**.

**What "as a team" means.** Calla's From is fixed ("EGBC Worship & AV
<EGBCWorship@callasuite.uk>") and can't change. So:
- the subject starts with the team's name ("Safeguarding: Your DBS
  check"), and the email opens "From the Safeguarding team, <church>" and
  closes "<sender>, for the Safeguarding team"
- **replies** go to the team's address, or to the sender when the team
  has none
- **one email per person**, so nobody sees anyone else's address
- **a copy** to the team's mailbox, when it has one ("A copy for the
  Safeguarding team: sent by Sally to 2 people")
- at most 300 people at once (the whole church shares 2000 an hour);
  the same address once; a bad address dropped

**Who may send as a team** (decided on the server, never the page):
- any team: its **leads and deputies**, the **Pastor** and the **office
  admin**
- **Safeguarding: its lead and deputy ONLY** (Martin, firm): not the
  Pastor, not the office admin, not a master admin
- being a master admin never counts on its own
- the Pastor and the office admin are named people on the settings page,
  not built in

**Safeguarding emails: the hub keeps the outline only** (when, who it
went to, who sent it, the subject), never the email. A new option on the
shared sender, `outlineOnly`.

**Settings: team-mail.html** (new, mine; master admins):
- the Pastor and the office admin
- "Start with the usual teams": Safeguarding, Worship, Pastoral, Office,
  Admin, Hospitality, Kids Church, Youth, Welcome team, Maintenance
- for each team: name (rename), shared address (optional), leads,
  deputies, Safeguarding; remove; add a team (any church)
- saved only through `teamMailSave`, which checks for a master admin.
  The rules let master admins read `teamMailboxes` and
  `teamMailSettings/main`, and let no page write them, a master admin
  included

**Sending:** events-admin's "Email everyone" now opens a small form:
Send as (Myself, or only the teams the server says this person may use),
Subject, Message. "Myself" works as before. A team goes through
`sendAsTeam`.

**Shut on the live site until switch-over**, like payments: the same
switch (`payments-gate.js` PAYMENTS_LIVE) opens both. Until then the
settings page says "Team emails open when the church switches over to
the new hub", nothing saves, and nobody can send as a team. The emulator
can be shut for a test (`teamMailSettings/config.shutForTest`, never
read live).

**Emails sent** shows "Team email: Safeguarding", sent by "Sally (as the
Safeguarding team)".

**New files:** functions/team-mail.js (exported from index.js),
team-mail.html. **Changed:** public-mail.js (outlineOnly), comms.js and
comms.html (the team and the sender), events-admin.html (Send as), the
rules (events section).

**For the main window:** a Menu entry for team-mail.html (master admins);
the same "Send as" in EmailBuilder2 if wanted (call `teamMailMine`, then
`sendAsTeam`).

**Proved:** team-mail.test 32/32, including the Pastor, a master admin
and the office admin each refused as Safeguarding.

### F-209 — Payments without a webhook (Martin, 15 Oct)

Stripe's webhook was "the thing I couldn't get them to give me" (for
Calla). It's self-service in an ordinary Stripe account, but the hub
must not depend on it. **Now both webhooks are optional.**

**Card (Stripe), with no webhook.** The hub asks Stripe itself, with the
church's key, then does exactly what the webhook would have done (the
same `handleStripe`), so the two can never disagree:
- **back from paying:** my place asks (`paymentCheck`), and a few times
  more if Stripe is a moment behind: "Paid £6.00 by card"
- **every 5 minutes** (`paymentsTidy`, was 10): unpaid held places are
  asked about; paid ones are marked paid; when the time is up, the
  session is **closed at Stripe first** (so nobody can pay for a place
  that has been given back), then the place is given back
- **refunds and disputes:** checked when my place opens, and when Who
  is coming opens (`paymentCheckEvent`, the event's admins)

**Found on the way:** an unpaid card place was only ever given back by
the webhook's "session expired". With no webhook it would have been
held for good. The 5-minute check now does it.

**Bank and Direct Debit (GoCardless), with no webhook:**
- a bank payment is asked about the same way ("Paid £8.00 by bank")
- **before a bank place is given back** when its time is up, GoCardless
  is asked first: if it was paid, it's kept
- **regular gifts:** a Direct Debit being set up is checked until it's
  ready, then the gift starts (with its email); a running gift's
  collections are checked every six hours at most, each recorded once,
  and failures noted once

**With a webhook as well,** it works as before, just quicker.

**The Payments page and the treasurer guide:**
- the key alone turns card payments on; the token alone, bank payments
- the webhook step is now "Optional: makes payments show straight
  away", after the key
- the status says "Card payments are on. The hub checks with Stripe
  itself..." instead of "Not finished"
- **the Stripe key's permissions changed:** Checkout Sessions Write,
  **Payment Intents Read** (new: for refunds), Charges and Refunds Read,
  Account Read. "Events: Read" is no longer needed. Nobody has made a live
  key yet (payments are shut until switch-over), so nothing to redo.

**Proved:** payments-nowebhook.test 17/17, with stand-in Stripe and
GoCardless that remember each payment, and no webhook secret ever set: a
full card payment ends in "paid"; paid but never came back; time up
(closed at Stripe, place given back); refunded; disputed; bank paid;
bank paid with the time up (kept); a gift started and collected once.

### F-210 — The door sheet; rota clashes and an overview (Martin, 15 Oct)

**The door sheet.** "Can I download a check-in list of attendees for an
event like I can with ChurchSuite?" On Registers and downloads
(attendance.html) there's now a **Door sheet** card, made by
**egbc-door-sheet.js** (new, mine):
- **a clean A4 page** ("Show and print": printing prints only the sheet)
  **and a PDF** ("Door sheet (PDF)")
- bookings **by the surname** of the person who booked, A to Z
- **a tick box for each named person**, on their own line; places booked
  without names shown once as "+ 2 more (no name given)"
- each booking's **ticket, places, "To pay £10.00" / "Paid £15.00 (card)"
  and notes appear once**, on its first line, so nobody pays twice
- **the total:** "6 places booked in 3 bookings · £10.00 to collect · 1
  on the waiting list". Waiting and cancelled people aren't on it.
- **optional columns,** ticked first: Phone, and each question. **Medical
  answers** (check-in's medical words, or a question flagged in
  check-in settings) are marked Medical, and the sheet is made only once
  the download is recorded (who, when, which columns), like every other
  download on this page. No record, no sheet.
- **a sign-up list, not an attendance record** (Martin's rule): it writes
  nothing about who came. The sheet says so at the bottom.

**Rota reports: two more** (ChurchSuite's; R2 is mine now, so in my page):
- **Clashes:** someone in two places at once: two slots of different
  teams at one service (Sound and the Kids Church Session Leader), or
  two services on the same day whose times overlap. Two slots of the
  same team at one service (a worship leader who also sings) isn't
  counted: that's usually meant. A service with no times counts as
  overlapping anything that day.
- **Overview** of the dates: each service, its time, "4 of 5" slots
  filled, and what's still empty.
- Both have a CSV download.

**Proved:** door-sheet.test 17/17 (A4 screenshot door-sheet-a4.png);
rota-reports.test 26/26 (was 21).

### F-211 — Team emails use the one list of teams (for the main window: field names)

The reviewing window, 15 Oct: the main window is building Teams & Groups
over the `teams` collection egbc-auth.js already reads. Team emails no
longer keep a second list.

**What changed (team-mail.html, functions/team-mail.js):**
- **No adding, renaming or removing teams in team emails.** The page
  shows the teams and says "add, rename or archive a team there"
  (Teams & Groups).
- **Which teams:** while `teams` is empty (Teams & Groups not landed), the
  hub's built-in list (EGBCAuth.TEAMS) plus Martin's ten. As soon as
  `teams` has any teams, exactly those, without archived ones.
- **My record keeps only the mail settings,** keyed by the team's id:

      teamMailboxes/{teamId} = { address, leads: [memberId], deputies: [memberId],
                                 safeguarding: true|false, updatedBy, updatedAt }
      teamMailSettings/main  = { pastor: memberId, officeAdmin: memberId }

  No name, no order, no archived flag: those are yours.
- **The name shown** on the page, in Send as and in the emails is
  `teams/{teamId}.label`, else `.name`, else the id. Renaming there
  renames it everywhere here at once.
- **Archived** (`teams/{teamId}.archived == true`): not shown, not
  offered in Send as, and sendAsTeam refuses ("That team has been
  archived"). Its mail settings are kept, so un-archiving brings it back
  as it was.
- **Every team on the list can be sent as** by the Pastor and the office
  admin (and its leads and deputies once set), even with no mail
  settings yet: replies then go to the sender. Safeguarding as before:
  its lead and deputy only.
- "Clear these settings" removes a team's mail settings; the team stays
  on your list.

**Field names to agree with the main window:**
1. `teams/{teamId}`: the id is the team's name as the rules spell it
   (as egbc-auth.js has it). I read **`label`** (shown), **`name`**, and
   **`archived`**, and **`order`** to sort. Please keep those names.
2. **Safeguarding** is marked on my record (`teamMailboxes/{id}.safeguarding`),
   a mail rule, not a team fact, so it needs nothing on yours. If you'd
   rather the team carry it (say `teams/{id}.safeguarding`), say so and
   I'll read yours instead.
3. If a team's id ever changes, its mail settings stay under the old
   id. Please archive-and-create as egbc-auth.js says (never change an
   id), or tell me and I'll move them.

**Live:** no team mail settings exist on the live site yet (saving is
shut until switch-over), so nothing to move.

**Proved:** team-mail.test 36/36, including the switch from the built-in
list to `teams`, a rename and an archive made on `teams`, and Clear.

### F-212 — The event team (Martin, 15 Oct: "if I run Film Club only me, Natasha and Val should be able to edit things and download lists")

**Before:** overseers were free-text names with no powers (overseerUids
never filled); canEditEvent also needed an admin role; ticket types and
questions were writable by ANY admin; and any admin of any area could
list every event's sign-ups.

**Now, for any church:**
- **"Event team"** on each event (events-admin, Details), instead of the
  overseers box: people picked from the address book, adults only
  (`isMinor` left out). Stored as `teamMemberIds`, `teamUids` (their
  accounts, looked up when saved) and `teamNames`. **The maker is on a new
  event's team.** Duplicating, and every new date of a series, keeps the
  team (they're saved through the same function).
- **Old overseer names:** a name that exactly matches one adult in the
  address book joins the team; the rest are shown ("Named before as
  overseers, not on the team yet: ...") for someone to choose.
- **The team (no admin role needed), plus master admins,** can: change the
  event; its ticket types and questions; see who is coming, download it,
  print the door sheet; check people in; email them; see payments. Also
  its notes, checklist, change history and capacity.
- **Nobody else sees an event's sign-ups.** "Any admin" is gone from
  sign-ups (list, change, delete), payments, check-ins, check-in settings
  and invitations. Kept: the event's leaders (`eventLeaders`) and the
  site's safeguarding lead (under-18 events), and a person listing their
  own sign-ups. An event made before teams can still be changed by the
  admin who made it (`createdBy`), so nothing live is orphaned.
- **An admin who doesn't run the event** (say the Maintenance admin, on an
  event tagged Maintenance) sees it, and is told: "Only this event's team
  (and master admins) can change it or see who is coming." No Save, no
  lists, no door sheet, no check-in.
- **"Events I run":** events-admin for someone on a team who isn't an
  admin: only their events, no New event (still an admin's job). Rooms,
  times and "Works with under-18s" are shown but not changed by them on
  an event with rooms (room bookings and safeguarding stay with admins).
  The app's What's on shows "Events I run" too, opening the event
  (`events-admin.html?open=<id>`). Helper: `EGBCEvents.eventsIRun()`.
- **Check-in:** the event's team and leaders (was: any admin). The
  cross-event **roll-call is now master admins only** (an area admin can
  no longer see every event's check-ins).

**The rules** (go live at switch-over): helpers `onEventTeam`,
`eventTeamOf`, `runsThisEvent`, `runsEventId`. **Edited outside the events
section, as this job asked** (rules elsewhere can't take away a broader
allow): `canSeeEvent` (the team may read its event, even unlisted),
`canEditEvent`, ticketTypes and questions write, capacity create/update,
signups list/update/delete, eventChecklists, eventNotes, eventChanges and
commsLog. Inside the section: checkins, checkinSettings, signupPayments,
eventInvites. Rules suite: 1384/1384, with a new block (Natasha edits Film
Club; the Maintenance admin can't see its list; someone who runs another
event can't; a master admin can; Natasha can't make a new event).
Five old checks changed meaning and were updated: "an admin lists the
sign-ups" is now refused unless on the team, and so on.

**For the main window:**
- the Menu's Events entry for anyone on an event's team, not only admins
  (`EGBCEvents.eventsIRun()` says whether they are on one)
- the app's Me tab, if wanted: the same list
- (Done, mine) forms-admin.html now says in words that an event's
  sign-ups are for its team, instead of showing the refusal;
  safeguarding.html already copes (it leaves the list out).

**Proved:** event-team.test 20/20; the rules suite 1384/1384.

**F-212, the older tests it touched** (30 rerun):
- e2-forms and e3-safeguarding: their "ordinary admin" now has to be on
  the event's team to open its forms or check-in; I put them on it, so
  those tests still prove what they were for (an ordinary admin can't see
  medical answers). e3-safeguarding's refusal words updated.
- k2-sunday: **the fire roll-call** (everyone checked in across the day's
  events) **is master admins only now**, because the rules no longer let
  an area admin see every event's check-ins. **Question for Martin:** a
  roll-call is a safety tool. Should named people (fire wardens, the
  duty steward) have it too? If so, a short list in settings, and the
  rule reads it; small job.
- The rest passed unchanged (stripe and payments-nowebhook each failed
  once at a timing point seen before, and are rerun).

### F-211 reply (main window, 15 Oct)

**Agreed, Teams & groups is built on those names.**
1. `teams/{teamId}` keeps **`label`**, **`name`** (always equal to the id;
   the rules check it), **`archived`** and **`order`**, plus colour, tint,
   parent, rota, tabs, runs, under18, updatedAt and updatedBy. No other fields
   are allowed by the rules.
2. Ids never change. teams-admin.html has no rename-the-id control (the
   label is renamed) and nobody can delete a team doc (rules); archiving
   is the only way out, and it keeps every marker.
3. Safeguarding on your record is fine. Nothing is needed on `teams`.
4. **One thing to align: three ids.** Your USUAL list (team-mail.html,
   functions/team-mail.js) says `Worship`, `Office` and `Youth`. The teams
   people are actually ticked into are **`Worship Team`** (label "Worship"),
   **`Church office`** and **`Youth Worship`** (label "Youth"), and that is
   what tools/seed-teams.mjs writes. Martin runs it at switch-over. Before
   it runs, your fallback shows both "Worship" and "Worship Team" with the
   same label. Please use those three ids in USUAL, or drop USUAL once
   `teams` is seeded. No team mail settings exist live, so nothing moves.
5. The seed also writes AV Team, Choir, Lazers, ReNu and Core Team, so
   none of them vanishes from team emails once `teams` has docs.

### F-213 — my-messages.html needs egbc-appmode.js (for the events window; from the main window)

Since 88eaf983 the app's Me tab opens My messages. In the app it then
shows the website's bar instead of the app's header, back arrow and tab
bar, and has no Care & support button. check-app-mode is red on it (5
lines: header, back arrow, tab bar, Care & support).

**Please add, as the first script after egbc-nosend.js** (as every other
page the app opens has it):

    <script src="egbc-appmode.js?v=202610141200"></script>

Then `node tests/check-app-mode.mjs` should be green for my-messages.html.
(Its other two reds, Worshipteamcharter and Youthcharter, are the known
leftover-data ones on a used emulator.)

### F-213 (the main window's request) — my-messages.html loads egbc-appmode.js

Done: `egbc-appmode.js?v=202610141200` straight after egbc-nosend.js, as
the other app pages. **check-app-mode: please rerun on your side.** I
started it from my clone, and it found another window's emulators on
your ports (9099), so its 19/20 isn't a clean answer for this change. It
uses invented people only.

Also: team emails' fallback list now uses the real `teams` ids ("Worship
Team", "Church office", "Youth Worship"), though with `teams` seeded the
fallback isn't used.

### F-214 — The fire roll-call goes to named people (Martin, 15 Oct)

- **Safeguarding settings, "Fire roll-call"** (master admins only; it
  saves on its own, apart from the safeguarding settings): pick people
  from the address book (adults only), each for **All buildings** or one
  building (site). For example the fire wardens and the duty steward.
- **They, and master admins,** open the fire roll-call
  (checkin.html?view=rollcall, now titled "Fire roll-call"): who is
  checked in at today's events and how many. A one-building warden
  sees that building only (the page says which). Names and "in since"
  only: no answers, no medical details, no contact details.
- **Each event check-in now records its building** (`buildingId`, the
  event's site), so the rules can give a warden their building's
  check-ins and nobody else's. (`siteId` is a children's-check-in field,
  so it couldn't be used.) Check-ins made before this have no building:
  an all-buildings warden sees them; a one-building warden doesn't.
- **Rules** (live at switch-over): `fireRollCall/main` = { people,
  memberIds, allSites, bySite: { siteId: [memberId] } }, master admins
  write it, the people on it read it. `fireWarden(buildingId)`; check-ins
  readable by a warden **by kind: booked, walk-in, leader**, never a
  child's check-in (kind "child", which holds collection codes). Adult
  leaders at a children's session show, which an evacuation needs.
- **Not included: children in the Sunday groups.** Their check-ins carry
  collection codes, so a warden doesn't get them; the children's leads
  have their own register in each room. **Question for Martin:** should
  wardens see a COUNT of children per room (no names, no codes)? That
  needs a small separate count kept by check-in; say if wanted.
- Also: the warden can't see sign-ups, their answers, the lists or the
  door sheet.

**Proved:** fire-rollcall.test 13/13; rules suite 1406/1406 (a new
block: a warden for every building; one for building B, refused A; an
event team member of another event refused; the warden refused sign-up
answers and the children's check-ins; only a master admin changes the
list).

**For the main window:** egbc-events-checkin.js changed (check-ins now
record their building). My pages load ?v=202610152300; app.html still
loads ?v=202610101200 - please bump it when you next touch app.html.

### F-215 — A YouTube video full screen didn't go landscape and couldn't be closed (Martin, 15 Oct)

**Why:** the installed app is held upright (the manifests say
`"orientation": "portrait"`), so YouTube's own full-screen button stayed
upright, and inside YouTube's full screen there was no way back.

**Done (events window, egbc-app-listen.js, "Listen & Watch"):** YouTube's
own full-screen button is taken away (`fs=0`). Under the video there is a
"Full screen" button of ours. It fills the screen with the same player
(not reloaded) and a big close button that is always on top. The close
button, Esc, and the phone's back all close it, and back stays in the
app. On Android it asks the screen to turn sideways. Where it can't (an
iPhone, or an upright phone that won't turn), the picture itself is
turned sideways to fill the screen. Proved: watch.test 45/45, with 9
deliberate breaks.

**For the main window, please:**
1. Bump `egbc-app-listen.js?v=` in app.html to 202610152330.
2. The hub's Watch card (hub-app.js about line 1522): its iframe `allow`
   has no `fullscreen`, so the same problem waits there. Either add the
   same pattern there, or add `&fs=0` and a link to the app's player. I
   haven't touched hub-app.js.
3. Optional: `"orientation": "any"` in manifest-app.json and
   manifest-hub.json would let the whole app turn with the phone. Not
   needed for the video now.

**Still to check on a real phone (Martin):** a real phone can't be
emulated here. Open the app, Me, Listen & Watch, play a video, then
Full screen. Does it go sideways, and does the close button bring you
back?

### F-216 — Fire wardens see a count of children per room (Martin, 15 Oct)

**Done:** the fire roll-call shows, for each building, "Creche 1 ·
Juniors 2 · total 3". Numbers only: no names, nothing about any child.
Kids Church leaders keep the names. Children are added into "People in
the building", counted once, including for master admins, who still see
the names.

**How:** a new function of mine, `kidsCountsKeep` (functions/kids-counts.js,
exported from functions/index.js), watches each child's roll-call copy
(kidsRoll). It writes `kidsCounts/<siteId>__<day>` = { siteId, day,
total, groups: [{ groupId, name, roomId, n }] }. It counts again in full
every time, so the numbers can't drift. Rules (events section): master
admins, the site's Kids Church leads and its fire wardens read it;
nobody writes it but the function.

**Martin deploys:** the function and the rules, at switch-over. Until
then wardens see the adults only, and master admins see the children by
name, as now.

**Proved:** fire-rollcall.test 24/24; rules suite 1415/1415; 8
deliberate breaks, all caught.

### F-217 — Prayer: the whole form before switch-over, and "For Sunday" (Martin, 15 Oct)

Martin: "no where to put in the details of the prayer. Also need a tick
to say if happy to share it on Sunday or not."

**Done (prayer.html, newhere.html: mine):**
- **Before switch-over the whole form shows.** Only the button is shut:
  "Prayer requests open on <date>" (or "when the new church hub opens";
  the date is churchSettings/launch.opensOn). Above it: "If someone is
  in immediate danger, call 999. Until then, please speak to a church
  leader in person." Praise reports and newhere.html are the same
  ("Sharing opens…", "Sending opens…"). Nothing is saved: the check at
  the moment of sending is kept, and the test forces the button on to
  prove it.
- **"Happy for this to be prayed for in the Sunday service?"** No (to
  start with) / Yes, with my name / Yes, without my name. It's saved as
  `prayers.sunday` = 'no' | 'named' | 'anon'; missing means no. The
  person can change it under My requests. Nobody else can (rules).
- **The readers** see the choice on each request. A new **"For Sunday"**
  tab lists only the yes ones that aren't answered yet, from the last
  four weeks, with the name only where the person asked for it, and a
  Print button. Each reader sees only what they can already read: the
  prayer team, only the ones shared with it.

**Rules (events section):** prayers create allows `sunday` (no, named or
anon only); the owner alone may change `sunday`, on its own.

**For the main window, please:**
1. worried.html and care.html (yours) still hide the form before
   switch-over. Martin wants them the same: show the whole form, shut
   only the button ("… open on <date>"), with the 999 line above it.
   `EGBCLaunch.DANGER` has the 999 words.
2. Add prayer.html (the Sunday question, "For Sunday", the shut button)
   and newhere.html to tests/audit-everything.mjs when it lands. I'll
   add my pages' own breaks once I can see its shape.

**Open question for Martin:** who reads "For Sunday" out? Today it's
whoever already reads requests (the pastoral team, the prayer team for
the ones shared with it, and the people named in Who gets told). If the
service leader isn't one of them, they won't see it. Should there be a
named "Sunday service leader" who sees the For Sunday list only?

### F-218 — Rota services in What's On: `calEvents/rota_<id>` is the server's (for the events window; from the main window)

"Enter a Sunday once" (Martin, 15 Oct): a rota service (`events/{id}`)
ticked **In What's On** in the Rota Planner is copied by the hub
function `rotaWhatsOn` to **`calEvents/rota_<id>`**:
title, description (a public line plus "Speaker: ..."), `category:
'service'`, `visibility: 'public'`, `audience: ['public','members']`,
`status: 'confirmed'`, startLocal/endLocal, **startUtc/endUtc in ms**
(as `E.utcOf`), `location: {kind:'room', siteId: <first site>}`,
`signupOn: false`, plus `source: 'rota'`, `rotaId`, `speaker`,
`createdBy: 'rota'`. The trigger rewrites the whole document at each
change on the rota, and deletes it when unticked, archived or deleted.

**Two requests:**
1. **events-admin.html:** show a `source: 'rota'` event read-only, with
   "This is a Sunday service from the rota. Change it in the Rota Planner"
   (and a link to Planner.html). Any change made there is overwritten at
   the next change on the rota.
2. **firestore.rules, calEvents (your section):** refuse client
   create/update/delete of ids starting `rota_` (the server writes them;
   it bypasses rules), e.g. `&& !calEventId.matches('rota_.*')`.

Proved here: check-rota-whatson 20/20 (what is copied, and that notes,
role names and the service leader never are), check-rota-whatson-live
8/8 (the trigger), check-sunday-once 11/11 (shows ONCE in What's On and
the embed, follows a renamed title, a non-public service never shows).

### F-219 — The app's Listen & Watch opens on an empty Listen (for the events window; Martin, 15 Oct)

Martin, viewing as a member: the channel's videos DO show under Watch,
but the tab opens on **Listen**, which says "No sermons yet..." (no
sermons until `sermonShow/feed.url` is set; Martin is getting Val's
feed). So members think nothing is there. In egbc-app-listen.js:
1. **Open on whichever part has something:** while there are no
   sermons, open on Watch.
2. **Better: a "Latest" strip at the top**, the newest video and the
   newest sermon side by side, then the Listen / Watch switch below.
3. Empty Listen: "Sermons will appear here once they are put up."

**The website now has the same** (main window, watch.html, "Watch &
Listen", Menu for everyone and a "Watch" tab on the hub's phone bar). It
reads exactly what the app reads (sermons published, sermonSeries,
watchShow/live and settings, videos members/feed) and uses egbc-watch.js
(`liveState`, `embedUrl`, `videoIdFromUrl`, `settingsOf`) unchanged. It
opens on Watch while there are no sermons, and has the Latest strip, so
the app and the website can match. The Menu entries for your admin pages
are now "Manage Watch" and "Manage sermons".

### F-220 — audit-everything: your pages' reds, and how to run it (for the events window; from the main window)

Martin, 15 Oct: "go through everything and properly audit it, or get code
to do it." `tests/audit-everything.mjs` is that code. Every Menu page and
every app screen and app-opened page, as six real seeded users (everyone,
worship, kids, core, areaAdmin, master), at 360/375/412/1440, every control
tapped once at 375. It runs before every report from now on, yours too.

    node tests/audit-everything.mjs --pages=events-admin.html,places-admin.html --roles=master,everyone
    node tests/audit-everything.mjs --quick              (375 only, every role)
    node tests/audit-everything.mjs --self-test          (each rule caught by its break)
    --port=9200 to run beside another one; the table is tests/audit-report.md.

Rules: console, overflow, bars (fixed bars over 25% of a phone), chrome
(two Care / two tab bars / website bar in the app), dead (a tap that does
nothing), covered, sheet (no close in view after scrolling it), hidden
(content under a bar), small (under 30px to tap on a phone), access.

**Your pages' reds in the final run (16 Oct, emulator):**
1. **Opens for people whose Menu doesn't offer it** (signed in as them, not
   View as). Each shows "nothing for you" in its own words, so it's your
   call whether each should refuse outright instead:
   attendance.html, checkin.html, events-admin.html (Events I run: by
   design?), kids-admin.html, kids-checkin.html, safeguarding.html,
   safeguarding-settings.html, headcounts.html, picture-library.html,
   places-admin.html. **sermons-admin.html and watch-admin.html open their
   full admin screens for anyone signed in** (writes are refused by the
   rules, but the screens shouldn't be there).
2. **events-admin.html, places-admin.html:** the end of the page is under
   the bottom bar for a master admin (the "View as" bar), at every size.
3. **Sheets with no close in view:** safeguarding.html "Report a concern"
   (mBack); events-admin.html "Share on WhatsApp" (egbc-share-back).
4. **A button that does nothing:** watch-admin.html "Add it" with the box
   empty; payments.html "Save" and team-mail.html "Save" with nothing
   changed or filled. Say what's needed, or grey them out.
5. **Under 30px to tap on a phone:** prayer.html (4 checkbox rows 23px),
   watch-admin.html (3, 21px), groups.html from the app (1, 20px),
   events-admin.html (a 22px checkbox).
6. Mine, fixed in the same push (for you to know): the app's rows with no
   action are no longer buttons (egbc-app.js row(): a div, no chevron; Listen's
   and Maintenance's wrapped rows keep their chevron by CSS).
### F-221 — The live audit (AUDIT-2026-10-15.md), the events window's part

**"View as" on my pages:** bookings-admin, groups-admin, kids-admin,
safeguarding-settings, checkin (the event, the picker and the fire
roll-call) and attendance now take "who may see this" from one helper,
`EGBCEvents.asSeen()` / `myUid()` / `viewing()` (egbc-events.js). While a
master admin views as someone, it gives no personal ids, so Martin is
nobody's event team, leader, safeguarding lead or bookings admin; and it
gives only the viewed team's rights (EGBCAuth's own answers).
`EGBCSafeguarding.myLeadSites()` gives none while viewing as, like the
Menu's isSafeguardingLead. Writes still carry the real uid.

**For the main window, please: care-inbox.html (yours)** reads
`EGBCAuth.profile()` (lines 94, 107) to decide it's the safeguarding lead
or deputy. So, viewing as Everyone, Martin still gets "You are the
safeguarding lead or deputy". `EGBCAuth.isSafeguardingLead()` and
`isCareReader()` already honour view-as, and `EGBCEvents.asSeen()` gives
a profile that does.

**audit-everything:** my pages are checked by
`screenshots/events/audit-events.test.mjs` (every page I made, 412px, as
Martin, a member on no team, a Kids Church member, and Martin viewing as
each of those two). It prints one line per page, person and check:
`AUDIT <page> <who> <check> PASS|FAIL`. Run it from audit-everything, or
read its lines.

### F-222 — For Sunday: the service leader and the Pastor (Martin, 16 Oct)

**Done:** a function of mine (functions/prayer-sunday.js) keeps one list
per Sunday, `prayerSundayList/<YYYY-MM-DD>`:
- only the requests marked yes, not answered, from the four weeks up to
  that Sunday, newest first
- a name only where the person said "Yes, with my name"
- that Sunday's service leaders: each service's `events.serviceLeader`
  (typed on the rota), matched to the address book by name
- `from` = Wednesday 00:00 before it, `until` = the end of the Sunday,
  UK time (the clocks going back are handled)

It's built again when a prayer request changes (prayerSundayOnPrayer),
when a rota service in the next fortnight changes (prayerSundayOnRota),
and every night at 00:10 (prayerSundayDaily).

**Rules (events section):** the Pastor (`teamMailSettings/main.pastor`,
the one setting team mail uses) reads any Sunday's list. A service
leader reads the list naming them, only between `from` and `until`.
Nobody writes one but the server. Neither the Pastor nor a service leader
gets any new access to `prayers`.

**prayer.html:** the Pastor and the service leader get a "For Sunday"
tab with that Sunday's list. People who already read requests keep
theirs, as before.

**Martin deploys:** the three functions and the rules, at switch-over.
These functions are safe before switch-over: they hold only what the
people asked to have read out.

**One thing to know:** the service leader is matched by the name typed
on the rota. A name typed differently from the address book (a nickname)
gets no list. The rota could store the person's id instead; that's the
planner's file (yours).

### F-223 — Session planner, Present, Quiz: PLAN (Martin, 16 Oct) - for review before building

**Mocks** (invented names), in `screenshots/events/`:
- planner-mock-term-375.png: the term table
- planner-mock-session-375.png: a week
- planner-mock-part-375.png: one part and what it shows on screen
- planner-mock-bible-375.png: the Bible picker
- planner-mock-settings-375.png: the groups
- planner-mock-remote-375.png: the leader's phone while presenting
- planner-mock-quizphone-375.png: joining a quiz and answering on a phone
- planner-mock-tv-verse.png and planner-mock-tv-quiz.png: the TV, at 1280×720

SundayServicePlanner.html is copied in approach only, not edited. Built in three parts, each
started once the last is in use.

**Feature names (rule 12):** `sessionPlanner`, `present` and `quiz`, each off for a church
that doesn't use it.

## Part 1 — The planner (`session-planner.html`; not planner.html, which on Windows is the same file as the Rota Planner)

**Groups (settings, master admins), `planGroups/{id}`:**
- name, kind (children, youth, sermon or other), ages from/to, day and time
- `leaderIds` (address-book ids)
- `teamName` (from the one list of teams: who reads the plans, and whose rota roles are
  "who's on")
- the email list
- `programmes` [{prefix (EJ, BC, SP, IAM), name, link}] - Urban Saints for Kids Church
- `parts`: the starting list (Welcome, Game, Story, Video, Craft, Worship, Prayer, Quiz)

Lazers is another group with the same parts and an older age range.

**Term view:** a table of Sundays like Karen's: date, lesson code + title, who's on, who's
away, and special weeks (a note, or "no session"). "Add a Sunday" adds the next date;
"Print the term" prints it. Tap a week for its detail.

**A session, `planSessions/{id}`** (open for Martin's follow-on idea: sessions as documents
with parts, linked to a date and a group):
- groupId, date, special, title
- programme, lessonCode, lessonLink ("Open Urban Saints")
- passage {ref, version, source, text, copyright}
- onIds, awayIds
- updatedBy, updatedByName, updatedAt, shown as "Last changed by …"
- `parts` [] - an array, saved in the dragged order (SortableJS 1.15.0, as the service
  planner). Each part has:
  - id, kind, title, minutes
  - notes (leaders only)
  - links[], files[] (Storage), bring[]
  - `show` [] - what goes on the screen, in order. Each one is {type, …} with type one of:
    - `verses` {ref, version, source, text, copyright}
    - `video` {file}
    - `youtube` {id, start}
    - `picture` {file}
    - `song` {songId - the hub's song, so words and CCLI come from the song list}
    - `memory` {ref, text}
    - `timer` {seconds}
    - `text` {words}
    - `quiz` {questions: [{q, answers[4], right, seconds}]}
    - `pptx` {file, slides[] (pictures), openLink}
    - `link` {url, label} (e.g. Open Urban Saints)

**Who's on / away:** "who's on" is the rota's roles for that group's team on that date.
"Who's away" comes from the hub's availability form for that Sunday, plus a leader can add
names. (Question 3.)

**Files:** Storage `planner/{groupId}/{sessionId}/…`. Video up to 500 MB (programme
downloads); PDF, pictures, PowerPoint and Word up to 50 MB.

**Who may do what (rules, not the page):** every leader of the group edits every plan of
that group (Samy writes it; Karen picks it up). The group's team reads. Master admins set
up groups. Anyone else: nothing.

**Bible - three sources, one picker** (version + passage → "Import into the plan", with the
copyright line saved alongside):
1. **Free Bibles on the hub.** ChurchShow's public-domain data/bibles, split into one file
   per book, so a phone loads ~100 KB, not 4 MB. Suggested: KJV, BSB, NHEB, ASV, BBE (about
   20 MB in the repo). I'll add a reference parser ("John 3:16-21", "Mark 4", "1 Cor 13",
   "I Samuel 3", with book-name aliases), which ChurchShow doesn't have.
2. **API.Bible with the church's own key.** The key is kept server-side
   (`privateSettings/apiBible`, which no page can read). A function of mine, `bibleFetch`,
   lists versions and fetches passages. It saves the copyright line, and sends the FUMS
   report that API.Bible's terms ask for (ChurchShow skips this; the hub shouldn't).
3. **Bible Gateway, as a link only** (`biblegateway.com/passage/?search=…&version=…`). Its
   text is never copied into a plan.

**Email:** to ALL the group's leaders, on or not, plus that week's team. The server builds
it from the saved plan (`planSend`, a function of mine, through the same sender as team
mail), so the page never sends its own HTML. Shut on the live site until switch-over, like
team mail. The print view is one A4: the parts in order, the passage, and every part's
"things to bring" gathered at the top.

**Sermon mode:** a group of kind `sermon` (the preaching team). The date and speaker come
from the rota (`events.speaker`); the plan adds title, series, passage and outline parts.
**For the main window:** there's no Preaching-plan data beyond `events.speaker` and
`serviceLeader`. My proposal: the planner keeps title, series and passage in
`planSessions`, and the Preaching plan reads them by date, rather than both writing
`events`. Please agree or counter.

## Part 2 — Present, run from the leader's phone (`present.html`)

**The TV:** "Present this session" on the laptop opens `present.html?s=…` full screen
(duplicate display is fine). It shows the current step large; mock: planner-mock-tv-verse.png.

**The leader's phone:** the same session opens as the controller (mock:
planner-mock-remote-375.png). It shows:
- what's on the TV now, and what's NEXT
- the leader's notes and a timer
- big Next and Back buttons, "Blank the TV" and "Jump to…"
- for a quiz, the answer and the scores

**Kept in step live:** through one document, `presentNow/{sessionId}` = {step, by,
startedAt, blank, quiz state}. The TV listens to it; any leader of the group can take over
from their own phone ("Kim can take over"). Arrow keys and a clicker on the laptop also move
it on.

**What it shows:**
- Bible verses, split to fit, with the copyright line
- pictures, text, the memory verse, a timer
- uploaded video files: no adverts, played from Storage
- YouTube (embedded)
- PowerPoint: converted to pictures of the slides on upload, plus an "Open in PowerPoint"
  step for slides with animations
- "Open Urban Saints" (a button on the TV; the laptop opens it)

**YouTube adverts:** never strip or download YouTube videos (that's against its terms).
- Prefer uploaded video files (programme downloads), which have no adverts.
- For YouTube, WARM UP: while the step before is showing, the next video starts muted and
  hidden behind a "Get ready" screen, so a pre-roll advert plays out unseen. On Next it
  jumps to 0:00, unmuted, and shows.
- The guide says: YouTube Premium on the laptop's account removes adverts entirely; mid-roll
  adverts appear only on longer videos.

**Wifi:** the next step is preloaded (pictures, the next video's first seconds). If wifi
drops, the TV keeps showing the step it has. When the phone can't reach it, the laptop's
arrow keys still work, and both catch up when it's back.

**PowerPoint conversion needs a converter.** Options:
- (a) a function of mine using LibreOffice in a container (Cloud Run): it's the reliable
  one, and costs a little
- (b) the leader exports the slides as pictures from PowerPoint ("Save as PNG") and
  uploads the folder
- I suggest (b) first, and (a) later if it's used. (Question 6.)

## Part 3 — Quiz (Kahoot-style), written in the planner

Questions are written in a quiz part: question, four answers, the right one, and seconds.

**TV mode (Kids Church, no phones):** the question, answers and timer on the TV (mock:
planner-mock-tv-quiz.png). The leader taps the winning team on their phone, and a
scoreboard follows.

**Phones mode (older groups):** join with a code on the TV, then answer on phones (mock:
planner-mock-quizphone-375.png), with a live leaderboard.
- First name or nickname only, no accounts (the hub's anonymous sign-in, if the main
  window agrees; otherwise a code-only session through a function).
- Answers live in `quizRuns/{runId}/players` and are deleted when the session ends (a
  function sweeps them after 24 hours anyway).
- The leader can remove a rude nickname.
- No personal data: the rules allow only {name ≤ 20 characters, answers, score}.

## Later — ChurchShow lesson mode (agree the format with the ChurchShow window first)

Every part's `show` list is already in a shape ChurchShow can import like a service:
- songs as hub song ids (words and CCLI from the song list)
- Bible refs + version
- video links and files
- files

Later: add `planSessions` (and their files) to what a paired ChurchShow device may read. I
won't build this until the format is agreed.

## Questions for Martin before building

1. Which free Bibles to put on the hub? KJV, BSB, NHEB, ASV and BBE suggested.
2. Does the church have an API.Bible key? NIV and other modern versions need a licence on it.
3. Who's away: from the hub's availability form, plus the leader adding names? (suggested)
4. storage.rules is shared: may I add a planner section (leaders write, the team reads,
   sizes above), as I did the events section in firestore.rules?
5. Phones-mode quiz: is anonymous sign-in OK for players (no account, nothing kept)?
6. PowerPoint: (b) export-as-pictures first, (a) a server converter later?

## For the main window

- a Menu entry (Plans → Session planner) for group leaders and teams, and the app's spaces
- the Preaching-plan fields (above)
- whether anonymous sign-in may be switched on for the quiz

## Tests and breaks, part by part

**Part 1 tests:**
- a leader saves; another leader picks it up and sees "Last changed by"
- a team member reads only (the rules refuse a write); someone else can't read
- the dragged order is saved
- each Bible source imports, and Bible Gateway text is never saved
- the email goes to every leader plus the week's team, built by the server
- print, 375px, and audit-events lines

**Part 1 breaks:** a team member can edit; the order isn't saved; a Bible Gateway passage is
saved; an absent leader is left off the email; the API.Bible key is readable by a page.

**Part 2 tests:** the phone moves the TV, a second leader takes over, arrow keys work, the
YouTube warm-up hides the pre-roll, and a wifi blip keeps the current step.

**Part 3 tests:** nicknames only, a removed nickname is gone, results are deleted, and
scores are right.

### F-224 — Replies to F-218, F-219 and F-220 (main window), and the rest of the audit

**F-218 (rota services):**
- **Rules:** done. calEvents create, update and delete are refused for ids `rota_*` (the
  server writes them). The suite checks that not even a master admin can make, change or
  delete one, and that it is still readable.
- **events-admin.html:** a `source: 'rota'` event is shown read-only with "This is a Sunday
  service from the rota. Change it in the Rota Planner" (see the commit).

**F-219 (Listen & Watch):** done in egbc-app-listen.js.
- While there are no sermons it opens on Watch, unless the person chose Listen.
- A "Latest" strip sits on top: the newest video and the newest sermon, side by side.
- An empty Listen says "Sermons will appear here once they are put up."
- watch.test checks all three. **Please bump `egbc-app-listen.js?v=` in app.html.**

**F-220, your list for my pages:**
1. **Opens for people whose Menu doesn't offer it:**
   - **Now marked refused** (`EGBCEvents.refused()` stamps `data-egbc-blocked`, the same mark
     the guard uses, and keeps the page's own words): attendance, checkin (an event and the
     fire roll-call), kids-admin, kids-checkin, safeguarding-settings, sermons-admin,
     watch-admin, and events-admin when the person runs no event. sermons-admin and
     watch-admin never showed their admin screens to anyone: the screen you saw was the
     intro line above the refusal, which your 160-character extract cut off.
   - **Left open by design:** safeguarding.html, because anyone may "Report a concern" from
     it.
   - **For you and Martin to decide:** headcounts, picture-library and places-admin use
     `data-admin="any"`, so they are for anybody who administers any area. Either the Menu
     offers them to area admins, or I narrow the guard. I won't change it without a
     decision.
2. **"The end of the page is under the bottom bar" on events-admin is a false red in
   audit-everything.** The lowest "visible" items it found are inside the closed
   `<details id="notices">` card (nt-copy, nt-save, nt-text). Current Chrome lays out a
   closed `<details>`'s content (content-visibility: hidden), so it has a size but isn't on
   screen. Please make `vis()` skip anything inside `details:not([open])` other than its
   `summary`. places-admin: its phone rule `body{padding:12px!important}` did override the
   bar's padding; fixed (top, left and right only).
3. **Sheets with no close in view:**
   - safeguarding.html "Report a concern": fixed. A ✕ in the top corner stays in view however
     far the sheet is scrolled.
   - **egbc-share.js "Share on WhatsApp" is yours** (my egbc-events.js says so). The same fix
     would be `max-height:92vh;overflow:auto` on `.egbc-share`, and a `position:sticky;top:0`
     ✕ button as the first child.
4. **Buttons that did nothing:** each now says what it's doing or what's missing, under the
   button rather than in a toast:
   - watch-admin "Add it" ("Paste the YouTube link first.") and the show-times "Save"
   - payments "Save" ("Type the team's name first." / "Nothing to save: … is already the
     money team.")
   - team-mail's two "Save"s ("Saving…" at once)
5. **Under 30px:** all fixed and held to 30px on every one of my pages by audit-events:
   - prayer, newhere and watch-admin choices: rows are 44px high
   - groups "Taking new members": 44px
   - events-admin's tick: a 44px tap area
   - attendance's column ticks: 44px

**"View as"** on my pages now uses `EGBCEvents.asSeen()` / `myUid()` / `viewing()`. Pages
that "ask the rules" (giftaid, prayer, newhere) don't ask while previewing, because a
preview can't be refused by the rules.

**Running audit-everything for my pages:** it talks to the dev emulators (8181/9099), which
another window was using, and writes tests/audit-report.md (yours). So I ran a copy from my
scratchpad against the events emulators (8182/9098, pages on 5601), with its report kept in
my scratchpad and nothing of yours changed. A `--emulators=events` switch in your tool would
let me run the real one.

**app.html bumps, please:** `egbc-events.js?v=202610161700` (it now holds `asSeen`, `ready`,
`refused` and `myUid`) and `egbc-app-listen.js` (F-219: Latest, opens on Watch). My pages are
bumped already.

### F-225 — Martin's answers (16 Oct), and the formats to agree: planner data, ChurchShow import, rota ids

**Done:**
- **Places and the Picture library:** the church office, bookings admins and master admins
  only. They use `EGBCEvents.mayRunPlaces()`: EGBCAuth's "bookings" part of Running things,
  which follows View as.
- **Headcounts:** Kids Church leads (who administer a team the children's settings name) and
  master admins only, through `EGBCEvents.mayHeadcount()`.
- The three pages now refuse in the page, and their guards ask only for a signed-in person,
  so a non-admin in the church office isn't turned away first. admin-pages.test 22/22.
- **The rules aren't narrowed.** They still let any admin read or write headcounts and
  pictures: "bookings admin of any site" can't be checked by the rules without reading every
  site. The pages and the Menu agree, as asked.
- **For the main window:** please make the Menu use the same answers. Places and Picture
  library: `EGBCAuth.runsTabs().indexOf('bookings') >= 0`, or a master admin. Headcounts:
  `EGBCEvents.mayHeadcount()`.

**Service leader and speaker by id:**
- prayer-sunday.js now matches `serviceLeaderId`, or `serviceLeader` given as `{id, name}`,
  by address-book id. It falls back to the typed name only where a service has no id.
- **Proposal for the field names** (please confirm, or tell me yours):
  `events.serviceLeaderId` and `events.speakerId`, kept next to the typed names (which stay
  for older services and for printing).
- The planner's sermon mode will use `speakerId` the same way.

**Planner data model (part 1)**, kept open for the follow-on idea:
- `planGroups/{id}`:
  - name, kind (`children` | `youth` | `sermon` | `other`), ageFrom, ageTo, day, time
  - leaderIds [address-book ids], teamName, email list
  - programmes [{prefix, name, link}], parts [names]
  - usesOffice365 (bool, from Church settings)
- `planSessions/{id}`:
  - groupId, date, special (`''` | a note | `none`), title
  - programme, lessonCode, lessonLink
  - passage {ref, version, source, text, copyright}
  - onIds, awayIds
  - parts []
  - updatedBy, updatedByName, updatedAt
- **Each part:** {id, kind, title, minutes, notes, links[], files[], bring[], show[]}
- **Each `show` step:** {id, type, …}, where type is one of
  `verses | video | youtube | picture | song | memory | timer | text | quiz | pptx | link`.

**THE CHURCHSHOW IMPORT FORMAT** (to agree with the reviewing window and the ChurchShow
window). A paired ChurchShow device asks the hub for a session, and gets back:

    { format: 'egbc-lesson/1',
      id, group: { id, name, ages }, date, title,
      programme, lessonCode, lessonLink,
      passage: { ref, version, source, text, copyright },
      steps: [ { part: 'Story', partId, n,          // in order, every part's show[]
                 type, ... } ] }

The step types, as ChurchShow would use them:
- `verses` {ref, version, source: 'bundled' | 'apibible' | 'biblegateway', text, copyright}:
  for `biblegateway` only ref and version, and ChurchShow fetches it itself, as it already does
- `song` {songId, title, ccli}: ChurchShow shows the words from the hub's song list and
  records CCLI
- `video` {url, name, seconds}: an uploaded file (no adverts)
- `youtube` {videoId, start}
- `picture` {url}
- `pptx` {officeUrl, fileUrl, name}: the OneDrive or SharePoint link, and an uploaded copy if
  there is one, so ChurchShow can run it in real PowerPoint or Impress
- `text` {words}, `memory` {ref, text}, `timer` {seconds}
- `quiz` {questions: [{q, answers[4], right, seconds}]}
- `link` {url, label}

Leaders' notes are not sent to the screen device. "Things to bring" is for the print only.
**For the reviewing window:** the read would be a new callable in my functions
(`lessonFor`), checking the device's pairing the way churchshow.js does, so the paired-device
code itself isn't changed. Or, if you'd rather, sessions are added to what churchshow.js
already serves. Your call.

**PowerPoint (part 2, Martin's answer 6):** a `pptx` step holds the deck's OneDrive or
SharePoint link. Present shows Microsoft's embed player full screen (animations, transitions,
video in slides). The clicker or arrow keys step the slides; the leader's phone says
"PowerPoint showing - use the clicker", and Next moves on to the following lesson step.
"Uses Office 365" is a Church settings tick (yes for EGBC). Without it: "Run this lesson in
ChurchShow". **For the trial I need 2-3 of Karen's real decks as OneDrive links** (Share,
then "Embed", or "Anyone with the link can view"). Martin, please send them when part 2
starts.

**Bibles (answer 1):** all 11 of ChurchShow's free Bibles (AKJV, ASV, BBE, BSB, Darby, DRC,
Geneva 1599, KJV, NHEB, Webster, YLT), one file per book, with the church's usual Bible
Gateway versions offered as links. **API.Bible (answer 2):** a box in Church settings where a
master admin pastes the key. It's stored in `privateSettings/apiBible` (no page can read it),
never shown again ("A key is saved. Paste a new one to replace it."), and used only by the
`bibleFetch` function. **Away (answer 3):** from the availability form. **Storage (answer
4):** a planner section in storage.rules, deployed at switch-over. **Quiz (answer 5):**
anonymous sign-in for players - for the main window: Firebase Auth's anonymous provider needs
switching on in the console at part 3.

### F-226 — Session planner, part 1, built (`session-planner.html`)

**What's there:**
- **One page with a group picker:**
  - ⚙ Groups (master admins): name, kind, ages, day, leaders, team, email list, programmes
    (`name | link`, where `{code}` in the link becomes the lesson code), and the parts of a
    session.
  - **The term:** a table of weeks, like Karen's (code + title, who's on, who's away, special
    weeks, "no session").
  - **A week:** date, special week or none, title, programme + lesson code + link; the Bible
    passage; who's on (the rota's roles for the group's team on that date) and who's away
    (the availability form for that date's services), both editable; "Last changed by".
- **Parts:** dragged to reorder (SortableJS 1.15.0, pointer mode for phones), saved in the
  dropped order. Each part has notes, things to bring (all gathered at the top and in the
  print), links, uploaded files (Storage `planner/<group>/<session>/`), and "show on screen"
  steps, also draggable. The step kinds: Bible verses, video file, YouTube, picture, song
  (the hub's song id), memory verse, timer, text, quiz (written as plain lines), PowerPoint
  (the OneDrive or SharePoint link), and a link ("Open Urban Saints").
- **Bible:** one picker, three sources.
  - **Free Bibles:** all 11 of ChurchShow's, in `bibles/`, one file per book.
  - **API.Bible:** the church's key, through `bibleFetch`.
  - **Bible Gateway:** a link only. The plan keeps the reference; the test proves no text is
    saved.
  - The key box is in Church settings, for master admins (`bibleKeySave` / `bibleKeyStatus`;
    the key itself is in `privateSettings/apiBible`, which no page can read).
- **Who:** every leader of a group edits every plan of it; its team reads; master admins set
  up groups. The rules (events section) and storage.rules (events section) both say so.
- **Email:** `planSend` (functions/planner.js) builds the email from the saved plan and sends
  one to every leader (on that week or not), that week's team and the group's list. It's
  shut on the live site until switch-over, like team mail.
- **Print:** one clean page, with no buttons and no chips.

**Proved:**
- session-planner.test 29/29
- admin-pages.test 22/22
- prayer-sunday.test 25/25 (by id)
- the rules suite (planner block added)
- deliberate breaks (see the report)

**For the main window, please:**
1. **Menu:** "Session planner" (session-planner.html) for the leaders and teams of any
   planGroup and master admins, and the app's spaces. The page refuses anyone else (marked
   refused).
2. **Feature name `sessionPlanner`** for the "What does your church use?" list (rule 12).
3. **sw.js:** please don't precache `bibles/` (47 MB). Cache a book when it's fetched, if
   anything.
4. **Deploy at switch-over:** the rules, storage.rules and functions `bibleKeySave`,
   `bibleKeyStatus`, `bibleFetch` and `planSend`. bibleFetch and the key box are safe before
   switch-over: only master admins and group leaders can use them.
5. **The Preaching-plan fields** (F-225: `serviceLeaderId`, `speakerId`).

### F-227 — lessonFor (egbc-lesson/1, agreed), and the API.Bible key before switch-over

- **`lessonFor`** (functions/lesson.js; churchshow.js unchanged):
  - **Who may ask:** only a paired ChurchShow computer. The token claim `device ==
    'churchshow'` and `devices/<uid>.active`, read on every call, so Disconnect stops it at
    once.
  - **`{ date }`:** that day's lessons.
  - **`{ sessionId }`:** the plan as egbc-lesson/1, exactly as F-225: every part's "show on
    screen" steps in order. A Bible Gateway passage goes as the reference only. Leaders'
    notes and "things to bring" are never sent.
  - **For the ChurchShow window:** call it with the device's own sign-in (Firebase callable,
    europe-west2).
- **API.Bible key before switch-over (your 9753fa95):** `bibleKeyStatus` now also says
  `shut`. Church settings then shows "The API.Bible key can be saved when the church switches
  over." with no box to paste into, and the same words if a save is refused. On the emulator
  the shut can be tested with the same test-only flag team mail uses
  (`teamMailSettings/config.shutForTest`).
- **Proved:** session-planner.test 37/37 (the shut key; lessonFor listing, format, Bible
  Gateway reference only, no notes, disconnected refused, a person refused); 6 deliberate
  breaks, all caught.
- **Deploy:** `lessonFor`, and `bibleKeyStatus` / `bibleKeySave` again (they changed).

### F-228 — lessonFor, as agreed for ChurchShow Lesson mode (replaces F-227's first version)

**Call:** `lessonFor({ date: 'YYYY-MM-DD', groupId? })`, a Firebase callable in europe-west2,
made with the paired computer's own sign-in.
**Returns:** `{ date, siteId, lessons: [ egbc-lesson/1, … ] }`.

- **Paired computers only,** checked as churchshow.js and the rules' `churchShow()` do: the
  token claim `device == 'churchshow'`, and `devices/<uid>.active` read on every call, so
  Disconnect stops it at once. churchshow.js isn't changed.
- **Its own building only.** A plan group now has a building (`planGroups.siteId`, chosen in
  ⚙ Groups: "Meets in"). A computer gets that date's lessons of the groups that meet in its
  building, from the device record's `siteId`. A sign-in claiming another building is
  refused. Asking for another building's group by id is refused.
- **Files and video** come as short-lived signed download links (3 hours,
  `expiresInMinutes: 180`), never the plan's own long-lived links. A PowerPoint step keeps
  its `officeUrl`, plus a short-lived `fileUrl` if a copy was uploaded.
- **Never sent:** leaders' notes and "things to bring". A Bible Gateway passage is the
  reference and version only.
- **Proved:** session-planner.test 42/42, including:
  - another building's computer gets none, and is refused by group id
  - an unpaired computer, one claiming the wrong building, a disconnected one and a person
    are all refused
  - links are short-lived
  - notes are absent

  Deliberate breaks: see the report.
- **Deploy:** `lessonFor` (changed), with the rules (planGroups may now hold `siteId`).
- **Before a group shows in ChurchShow,** a master admin sets its building in the planner's
  ⚙ Groups.

### F-229 — Who may post and email (Martin, 16 Oct); pages that ignore "View as" (for the events window; from the main window)

**Martin's decision, now in the rules, the hub and the server (any church):**
team leaders (adminFor a team) post a notice to THEIR teams and email
THEIR team's people; the church office (Church office group) and master
admins post to everyone and email anyone; nobody else gets either button.
- `news` (firestore.rules): create/update/delete by `mayNoticeTo(teams)`:
  master, Church office, or an admin whose `adminFor` holds every team on
  it. A leader can't post to everyone (`teams: []`).
- `addressBook` write: master and the office, anyone; a leader, records on
  their teams, adding or removing only their own teams' ticks, never
  adminFor/masterAdmin/isMinor; new people on their teams only.
- The Email Compiler now sends through the hub (`compilerSend`), which
  checks every recipient against the sender's teams and logs to
  emailOutbox (so it shows in Emails sent). **Team emails (`sendAsTeam`,
  yours)** has its own leads/deputies list; worth checking it agrees with
  this rule (a team's leads there vs `adminFor` here).

**Your pages that show the real master admin's view while "View as" is on**
(the reviewing window's audit, §4): Room bookings (approve/decline),
Small groups (Oversight, Settings), Children's register, Safeguarding
settings, Event check-in, Registers. They ask who is really signed in;
please ask `EGBCAuth.isMaster()` / `isAdminOf()` / `effectiveTeams()`,
which honour View as. (Mine fixed the same way: care-inbox.html.)

**Refused pages:** egbc-auth's refusal card no longer wipes the page (its
content goes into a hidden, inert box), so a page's own script no longer
throws "Cannot set properties of null" behind it. Pages that read data
should still wait for the guard: `egbc-db.js` now exports `allowed`
(settled on `egbc-ready`; only for pages WITH a guard), and egbc-guard sets
`window.EGBC_READY`. audit-everything now fails a refused page that logs
errors.

### F-230 — Your F-225/F-226 asks: done, and six for you (from the main window, 16 Oct)

**Done (main window):**
- **Menu: Session planner** (`session-planner.html`, feature `sessionPlanner`, added to
  egbc-church.js's list) for a plan group's leaders, its team, and master admins.
  `EGBCAuth.isOnPlanGroup()` reads `planGroups` with the profile (leaderIds
  array-contains, teamName in teams; a master admin all) and honours View as.
  It sits beside Rota and Preaching plan until the Menu-by-job lands (awaiting
  Martin's approval). The app's spaces get it then, too.
- **Places and Picture library:** `runs: 'bookings'` (= `runsTabs()` has
  'bookings', or a master admin). **Headcounts:** `EGBCAuth.mayHeadcount()`, the
  same answer as your `EGBCEvents.mayHeadcount()`, from `kidsSettings` read with
  the profile, so the Menu draws without waiting. check-menu covers all three.
- **Rota ids:** the Rota Planner and the Preaching plan save `serviceLeaderId` /
  `speakerId` beside the typed name (one exact address-book match → the id;
  a guest → `''`). check-sunday-once and check-preaching-plan cover it.
- **One Pastor:** the rebase gave firestore.rules two `isPastor()` (they did not
  compile). Mine is gone. The Preaching plan uses yours, `teamMailSettings/main.pastor`,
  and its Pastor box now just names them, with a link to Team emails. Added in the rules:
  the Pastor may read `teamMailSettings/main`, so the page knows them. That document
  holds ids only.
- **audit-everything `--emulators=events`:** Firestore 8182, Auth 9098, pages on
  5601, its own report (`tests/audit-report-events.md`) and pictures. Content in a
  closed `<details>` is no longer counted as on screen.

**For you, please:**
1. `egbc-events.js` line ~614: load `egbc-share.js?v=202610161900` (the sticky ✕).
2. `session-planner.html`: `egbc-auth.js` and `egbc-shell.js` to `?v=202610162000`
   (it still loads 202610160500, so it misses the Menu entry and View as fixes).
3. Your three pages' `data-admin="any"` came off in your cd3b39bf. I kept that, with
   egbc-guard.js at 202610160810.
4. My F-225 heading clashed with yours, so it is renumbered F-229 above (and this one F-230; yours took F-227 and F-228).
5. **bookings-admin.html, day view** (check-style-every-screen, the last reds in it): the
   "←" button reads as an emoji (please use a Lucide chevron), and the 07:00 time labels are
   11px (DESIGN.md: 12px at least).
6. **check-every-page-is-checked:** 13 of your pages had never been listed. I put them in
   NOT_YET as "the events window's", the same as your others. Please move them into
   tests/group1-screens.mjs as you restyle them.

### F-229 — Sermon mode: the planner and the Preaching plan, linked both ways (Martin, 19 Oct)

**Rota to planner:**
- In a group of kind `sermon` (the preaching team: its leaders edit, its team reads), "+ Plan
  a sermon for a service" offers the rota's services (your SERVICE_TYPES, or ticked for What's
  On) that have no sermon plan yet.
- The plan keeps the service's id (`planSessions.eventId`) and its `date`, `speakerId` and
  `speaker`. It starts with `publicTitle` as the title and the first reader's passage as the
  passage.
- Each time the plan is opened, the service is read afresh: "From the Preaching plan" shows
  the date, speaker, service leader, description and readers. If the date or speaker changed,
  the plan says so and saving keeps the new one.
- The planner never writes `events`. The Preaching plan stays where they're changed.

**Planner to rota:** my trigger `sermonLinkKeep` (functions/sermon-links.js) keeps
`sermonLinks/<eventId>` = { eventId, sessionId, groupId, title, series, passage (the
reference), speakerId, updatedAt }. It's kept only for sermon groups' plans, removed when the
plan goes or moves, and never holds the outline or the notes. Any volunteer may read it, as
the rota; nobody but the server writes it.

**For the main window, please:** on preaching-plan.html, read `sermonLinks/<event id>` for
each row and show, e.g. under the speaker, "Sermon plan: <title> · <passage>", linking to
`session-planner.html?s=<sessionId>`. Leave it out when there's none.

**Proved:** sermon-planner.test 21/21 at 375px (offered from the rota, not a band practice;
linked by id; the link and what it never holds; the Preaching plan changing the speaker; not
offered twice; the team reads only; the link is readable, never writable; a children's plan
never makes one; a deleted plan removes it). Breaks: see the report.

**Deploy:** `sermonLinkKeep`, and the rules (planSessions may hold `eventId` and `speaker`;
sermonLinks).

### F-230 — Building compliance, Stage 1: the data and the schedule engine (Martin, 19 Oct)

**The six things the brief says to establish first (read from the code):**
1. **Buildings and rooms:** `sites/<id>` and `rooms/<id>` (siteId), made and changed in Places
   (places-admin.html). Compliance hangs off them: no second list.
2. **People and roles:** `addressBook` (ids are memberIds), `users/<uid>` (memberId, teams,
   adminFor, masterAdmin, status); teams are the `teams` collection. **Trustees:** taken as the
   Elders group plus master admins (Martin confirmed, 19 Oct; Stage 2, in the rules).
3. **Email and notifications:** `functions/public-mail.js` makeSender (and notify.js for phone
   notifications). Stage 3's reminders will use them; no second mailer.
4. **Uploads:** Firebase Storage with rules per path. **There is no per-tier storage allowance
   in the hub**, so nothing to count against. Recorded; certificates simply go to Storage
   (Stage 2).
5. **Add-on switch:** `EGBCChurch.uses(name)` returns true for everything today (no stored
   switches yet). The reviewing window's reading: a `buildingCompliance` switch, OFF by
   default. **For the main window:** make `uses()` read the church's switches
   (churchSettings) so a switch can default to off; until then my pages will check
   `churchSettings/features.buildingCompliance === true` themselves (Stage 3).
6. **Tasks:** the Maintenance jobs (`maintJobs`). Martin: one list, never two. A follow-up on a
   check IS a job carrying `checkId`; a job has a `safety` tick (suggested from its words) and
   a `due`. Only safety jobs change a colour.

**Built (all new files; nothing existing changed):**
- **`egbc-compliance.js`, THE schedule engine (one function, used everywhere):**
  - `schedule()`: profile, templates, the church's copies, records, jobs and triggers give
    the items, each with next due and red/amber/green.
  - `applies()`, `nextDue()` (from the day DONE; a certificate's own expiry wins).
  - `reconcile()`: an answer changed means checks are added, removed (history kept) or
    restored.
  - `register()`: the extinguisher register, room by room, amber where a suggested type is
    missing.
  - `suggestSafety()`: the safety tick suggested from a job's words.
  - It loads in a page and in node: the server will use the same file.
- **`egbc-compliance-templates.js`, the starter templates as DATA:** 88 checks, 31 profile
  questions, version 1.
  - It holds the brief's table, plus Martin's additions: passive fire, the extinguisher and
    fire blanket register (kinds of room, the guide), Martyn's Law, H&S, food, licences,
    security, accessibility, heating, evacuation (PEEP and GEEP reviews, refuge points,
    evacuation chair), safeguarding yearly checks, lone working, transport, contractors,
    events, winter and storms, and data protection.
  - "Only when needed" checks (fire stopping after building work, contractor work, a large
    event, a storm, a leaver) appear when the thing is recorded.
  - Links, not copies: Safeguarding, hirers' documents, CCLI.
- **`egbc-compliance-store.js`, where it is kept** (on the existing sites and rooms):
  - **Templates and answers:** `complianceTemplates` (global, versioned) and
    `buildingProfiles/<siteId>`.
  - **The church's copies:** `buildingChecks/<siteId>__<templateId>`.
  - **What happened:** `checkRecords` (never deleted) and `buildingWork` (what an "only when
    needed" check waits for).
  - **Rooms and the register:** `roomProfiles/<roomId>` (the kind of room) and
    `fireEquipment` (the register).
  - **The audit:** `complianceLog` (append only).
  - **Follow-ups:** `maintJobs`, as above.
  - **Functions:** apply a profile, edit a copy (never the template; switching off needs a
    reason), add the church's own check, record done, record building work, offer and apply
    a template update (keeping what the church changed).
- **`tools/seed-compliance.mjs`:** the templates into `complianceTemplates` (`--live` for
  Martin at launch), and the synthetic test church on the emulator only: a Church of England
  church built before 2000 with gas and lightning protection, a public hall with food and play
  equipment and no gas, and a let house with gas.
- **Val's "The building" phone screens, designed first** (375px mocks, not built yet):
  `screenshots/events/building-mock-home-375.png` (checks due, jobs to do, a big "Report a
  problem"), `-check-`, `-walk-` (the extinguisher tick-list) and `-done-`.

**Read as the brief allows (the reading that builds least):**
- A check never recorded is amber ("Not recorded yet"), not red, so a new church isn't all
  red on day one.
- A follow-up raised from a check starts with the safety tick on, so the brief's "an open
  follow-up past due is red" holds through Martin's safety rule.
- "Every 12 months, or after major changes" (the fire risk assessment) is yearly; "after
  major changes" becomes building work recorded (fire stopping), as the same trigger.
- Frequencies: now the law's or the standard's, put in automatically, each labelled; see
  F-232 (this replaces "for Martin to confirm").

**Legal references (kept OUT of the product, here only):** the "legal requirement" on the
let-house gas safety check is the landlord's annual gas safety duty. Martyn's Law is the name
people know (the regulator's register is expected around spring 2027). "ICO" is the data
protection regulator's name, not a citation. No regulation numbers appear in code, data or
screens; the test checks.

**For the main window (agree the shared fields):**
- **Inventory** (inventory-system-2.html, yours) is to become the church-wide asset register
  feeding the compliance checks (PAT, ladders, evacuation chair, defibrillator). Proposal:
  you keep the page; each item gains `roomId` (Places), `value`, `serial`, and `inspections:
  { pat, ladder, … : nextDue }`. I read those into the schedule; one record per item.
- **retention.html (mine) and your privacy tools (§24 item 8)** for the information asset
  register: proposal `dataAssets/<id>` = { name, where, owner, purpose, lawfulReason,
  retention, sharedWith, collection (if it's one of the hub's) }, and `suppliers/<id>` = {
  name, role, agreementPath, reviewDue }.
- **`EGBCChurch.uses()`** to read stored switches (above).

**Later stages, as briefed and gated:**
- **Stage 2:** the screens and the rules (assigned people see only theirs).
- **Stage 3:** bookings dot, reminders, trustee report, the switch.
- **Stage 4:** the live risk register, with Martin's wording on every screen, PEEPs and GEEPs.
- **Stage 5:** importing with AI, never auto-applied.
- Also to come: safeguarding activity assessments (lead and deputy, master admins, and each
  activity's own leaders), lone-worker "I'm in / I've left", the information asset register,
  breaches and requests (lead and master admins only).

**Proved:** compliance-stage1.test 41/41 on the emulator; 9 deliberate breaks, all caught (see
the gate report).

### F-232 — Compliance frequencies: the law's, or the standard's (Martin, 19 Oct). For the reviewing window to verify

**What changed:**
- **The frequencies are put in automatically.** Each check takes the legal frequency, or the recognised standard's, when a building's profile is answered. No one confirms them first.
  - "Martin confirms the starter frequencies before launch" is gone from the brief, the templates, F-230 and the screens.
  - **Instead, please verify the "Legal requirement" rows below against the sources.**
- **Every check carries a label**, shown in plain words beside it (and on the trustee report, Stage 3):
  - **Legal requirement:** UK law sets the frequency.
  - **Recommended standard:** the law says "maintain" or "review regularly", and a British Standard or official guidance sets the frequency.
  - **Good practice:** neither exists, so the frequency is kept modest.
- **The law is a floor.**
  - A church may make any check MORE frequent.
  - **Legal requirement:** it can't be made less frequent, put on "only when needed", or switched off. Each is refused with a plain reason. If the check doesn't apply, the church changes the answers about the building instead.
  - **Recommended standard:** it can be lengthened only with a reason, which is kept on the check and in the log.
  - **Good practice:** the church decides.
  - The store and the engine (`allowEvery`) refuse this now. The Stage 2 rules will refuse the same.
- **When the guidance changes, the checks follow it automatically** (a new template VERSION):
  - The engine's `effective()` shows the new guidance at once, to everyone.
  - `followTemplates()` writes it to the church's copies, and it is logged.
  - **The church's stricter choice is kept.** If the church had made a check more frequent than the new guidance, it keeps its own and sees a note: "The guidance is now every 9 months. You check it more often, so yours is kept."
  - **A lengthened check follows the change.** If the church had lengthened a recommended check (with a reason), it follows the changed standard.
  - **The legal floor holds.** A legal check never stays less frequent than the law.
- **Templates are now version 2:**
  - 90 checks, with two new: `eicr-let` (the let house's own legal electrical inspection) and `play-routine` (the monthly play equipment check).
  - **Changed from version 1, following the standards:**
    - extinguishers and blankets in place: monthly to **weekly**
    - fire blanket: monthly to **weekly**
    - visual and vibrating alarms: monthly to **weekly**, with the alarm test
    - defibrillator: monthly to **weekly**
    - intruder alarm service: yearly to **every 6 months**

**How the sources were checked (19 Oct 2026):**
- **Official pages:** gov.uk, hse.gov.uk and legislation-based guidance pages were read directly where they could be fetched.
- **Paywalled standards:** BSI's documents are paywalled, so for those I used summaries from installers or councils that quote the standard.
- **Marked "secondary":** the rows that rest on such summaries. Those are the ones to look at hardest.
- **Where sources disagree, I took the stricter**, and each row says so.

| Check (id) | Frequency | Label | Source | Checked |
|---|---|---|---|---|
| fire-ra: review the fire risk assessment | 1 year (and after major change) | Good practice | Fire Safety Order 2005 art. 9: keep under review, no interval. gov.uk "Fire safety risk assessment: small and medium places of assembly" (2024): "keep your assessment under review", no interval. Yearly is the common practice. The professional report's own next-review date is a check from Stage 4 | 19 Oct 2026 |
| fire-alarm-test | 1 week | Recommended standard | gov.uk places-of-assembly guide: "Test fire detection and warning systems… weekly" (BS 5839-1). The same guide also says the control panel is checked every 24 hours. Not a schedule item: noted for the alarm's own log | 19 Oct 2026 |
| fire-alarm-service | 6 months | Recommended standard | gov.uk places-of-assembly guide: six-monthly test and maintenance by a competent person (BS 5839-1) | 19 Oct 2026 |
| emlight-quick | 1 month | Recommended standard | gov.uk places-of-assembly guide: monthly function test (BS 5266-1). The guide's checklist also lists a six-monthly test from the older standard. The current BS 5266-1 needs monthly and annual only, so not added. **Say if you want it** | 19 Oct 2026 |
| emlight-full | 1 year | Recommended standard | gov.uk places-of-assembly guide: annual full-duration test by a competent person (BS 5266-1) | 19 Oct 2026 |
| ext-in-place (register) | 1 week | Recommended standard | **Sources disagree; the stricter is taken.** The gov.uk guide's checklist says weekly ("correctly located and in apparent working order"). Its Part 2 text and BS 5306-3 say "monthly should be enough" | 19 Oct 2026 |
| ext-service (register) | 1 year | Recommended standard | gov.uk places-of-assembly guide: "Maintenance by a competent person should be carried out annually" (BS 5306-3) | 19 Oct 2026 |
| fire-doors | 1 month | Recommended standard | gov.uk places-of-assembly guide: monthly check that fire doors close correctly, frames and seals intact | 19 Oct 2026 |
| fire-doors-detailed | 6 months | Recommended standard | **The stricter is taken.** The gov.uk guide says an annual fit check. BS 9999 says 6-monthly (secondary) | 19 Oct 2026 |
| escape-routes | 1 week (recorded); looked at daily | Recommended standard | gov.uk places-of-assembly guide: escape routes and exit doors checked **daily**. The engine has no daily clock, so the check says "Look each day the building is in use; record it here once a week". **For Martin:** that is weaker than the guide as a recorded frequency | 19 Oct 2026 |
| fire-signs | 1 month | Good practice | No fixed frequency found | 19 Oct 2026 |
| fire-blanket | 1 week | Recommended standard | gov.uk guide checklist: firefighting equipment weekly (as ext-in-place) | 19 Oct 2026 |
| fire-drill | 1 year | Recommended standard | gov.uk places-of-assembly guide: "at least annually or as determined by your fire risk assessment" | 19 Oct 2026 |
| fire-marshals: training | 3 years | Good practice | The gov.uk guide says "refresher sessions at pre-determined intervals", no interval | 19 Oct 2026 |
| smoke-alarms (house) | 1 month | Recommended standard | Smoke and Carbon Monoxide Alarm (England) Regulations 2015 (amended 2022): working on the day a tenancy begins, repaired when reported; no testing interval. Fire and rescue services' advice is to test monthly. **Not labelled legal**, because the law sets no frequency | 19 Oct 2026 |
| co-alarm (house) | 1 month | Recommended standard | As smoke-alarms | 19 Oct 2026 |
| evac-chair | 6 months | Good practice | No official frequency found (manufacturers' service intervals) | 19 Oct 2026 |
| refuge-points | 1 week | Recommended standard | BS 5839-9 (emergency voice communication, refuge calls): a weekly user test, like the fire alarm (the reviewing window's check, 19 Oct; the standard itself is paywalled) | 19 Oct 2026 |
| refuge-service | 6 months | Recommended standard | BS 5839-9: periodic servicing by a competent person. The interval is not seen directly; **6 months taken, the stricter**, to match the fire alarm's service under BS 5839-1. **To verify** | 19 Oct 2026 |
| visual-alarms | 1 week | Recommended standard | Part of the weekly fire alarm test (gov.uk guide, BS 5839-1) | 19 Oct 2026 |
| peeps-review | 1 year | Good practice | The gov.uk guide sets no interval | 19 Oct 2026 |
| geep-review | 1 year | Good practice | As peeps-review | 19 Oct 2026 |
| fire-stopping | after building work | Good practice | Building Regulations (fire compartments must be kept); no interval: on demand | 19 Oct 2026 |
| eicr (not a let house) | 5 years | Recommended standard | Church Buildings Council guidance via Ecclesiastical's church electrical guidance: churches every five years, to IET Guidance Note 3. GN3's own table was not seen (paywalled). **To verify** | 19 Oct 2026 |
| eicr-let (let house) | 5 years | **Legal requirement** | Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020. gov.uk guide for landlords: "at least every 5 years by a properly qualified person". A shorter interval applies if the report says so (a certificate's own date wins in the engine) | 19 Oct 2026 |
| pat | 1 year | Recommended standard | HSE: no law sets a frequency; by risk. IET Code of Practice for In-service Inspection and Testing: equipment used by the public is tested yearly (secondary) | 19 Oct 2026 |
| gas-service | 1 year | Recommended standard | Gas Safety (Installation and Use) Regulations 1998 reg. 35: an employer keeps appliances in safe condition, no interval. HSE and Gas Safe advise a yearly service | 19 Oct 2026 |
| gas-safety (let house) | 1 year | **Legal requirement** | Gas Safety (Installation and Use) Regulations 1998 reg. 36: a landlord's gas safety check every 12 months, with a copy to tenants | 19 Oct 2026 |
| legionella-ra | 2 years | Good practice | HSE ACoP L8: review "regularly", and when there is reason to suspect it is no longer valid; the old 2-year figure was dropped in 2013. Secondary sources vary from quarterly to 2 years. **For Martin:** you listed this as a "recommended standard"; I found no official number, so it is Good practice, with a modest 2 years | 19 Oct 2026 |
| water-temps | 1 month | Recommended standard | HSE (hse.gov.uk/legionnaires): "Check water temperature at sentinel outlets on a monthly basis" (HSG274 Part 2) | 19 Oct 2026 |
| flush-taps | 1 week | Recommended standard | HSE: "For infrequently used outlets, instigate a programme of regular flushing (weekly)" | 19 Oct 2026 |
| asbestos-survey | once, kept | **Legal requirement** | Control of Asbestos Regulations 2012 reg. 4 (the duty to manage): find out whether asbestos is present, and keep a record and a plan | 19 Oct 2026 |
| asbestos-reinspect | 1 year | Recommended standard | HSE guidance (HSG227 and the duty-to-manage pages, quoted by councils and surveyors): known asbestos re-inspected at least every 12 months (secondary) | 19 Oct 2026 |
| lightning | 1 year | Recommended standard | BS EN 62305-3 Table E.2 varies by protection level. **The stricter is taken:** installers quoting it give yearly (secondary) | 19 Oct 2026 |
| roof-gutters | 6 months | Good practice | No official frequency. Church Buildings Council advice: spring and autumn. Martin chose 6 months (19 Oct) | 19 Oct 2026 |
| lift (incl. stairlift) | 6 months | **Legal requirement** | LOLER 1998 reg. 9. HSE: thorough examination every 6 months for equipment lifting people, 12 months for other lifting equipment, unless an examination scheme says otherwise. A stairlift carries people. It applies where the lift is work equipment (staff or volunteers working there) | 19 Oct 2026 |
| play-visual | 1 week | Recommended standard | BS EN 1176-7: the routine visual inspection, daily to weekly by use. The stricter end for a church's occasional use is weekly (the reviewing window's correction, 19 Oct; secondary) | 19 Oct 2026 |
| play-routine | 1 month | Recommended standard | BS EN 1176-7: the operational inspection, every 1 to 3 months; the stricter end, monthly (secondary, not seen directly) | 19 Oct 2026 |
| play | 1 year | Recommended standard | BS EN 1176-7: the annual main inspection (secondary: parish councils' RPII inspections) | 19 Oct 2026 |
| walk-round | 1 month | Good practice | | 19 Oct 2026 |
| boundaries | 1 year | Good practice | | 19 Oct 2026 |
| trees | 1 year | Good practice | No fixed frequency (the National Tree Safety Group: by risk zone) | 19 Oct 2026 |
| oil | 1 year | Recommended standard | OFTEC: yearly service of oil boilers and tanks (BS 5410) | 19 Oct 2026 |
| wood-burner | 1 year | Recommended standard | HETAS and fire and rescue services: sweep at least once a year. HETAS says up to four times a year in heavy use, so it can be made more frequent | 19 Oct 2026 |
| accessibility | 1 year | Good practice | | 19 Oct 2026 |
| hearing-loop | 1 month | Good practice | | 19 Oct 2026 |
| hs-ra | 1 year | Good practice | Management of Health and Safety at Work Regulations 1999 reg. 3: review when no longer valid; no interval. HSE: "review regularly" | 19 Oct 2026 |
| hs-policy | 1 year | Good practice | Health and Safety at Work Act 1974 s.2(3): revise "as often as may be appropriate" (5+ employees) | 19 Oct 2026 |
| chemicals | 1 year | Good practice | COSHH 2002: review the assessment regularly; no interval | 19 Oct 2026 |
| ladders | 6 months | Good practice | HSE INDG455: a pre-use check each time, and detailed inspections "at regular intervals" (per the manufacturer). Martin's figure | 19 Oct 2026 |
| first-aid-kits | 1 month | Good practice | HSE L74: check contents "frequently" | 19 Oct 2026 |
| first-aiders | 3 years | Recommended standard | HSE L74: first aid at work certificates last 3 years (an annual refresher is strongly advised) | 19 Oct 2026 |
| accident-book | 1 year | Good practice | RIDDOR keeps records 3 years; no review interval | 19 Oct 2026 |
| defib | 1 week | Recommended standard | **The stricter is taken.** NHS ambulance service schemes (London Ambulance Service accreditation): a visual check at least weekly, and a switch-on test monthly, recorded. Others say "by the manufacturer". This replaces version 1's monthly (Martin's earlier figure) | 19 Oct 2026 |
| food-reg | once, kept | **Legal requirement** | Retained Regulation (EC) 852/2004 art. 6: register with the council at least 28 days before starting. **Councils differ** on whether occasional church catering needs it; the check's note says the council decides | 19 Oct 2026 |
| food-hygiene | 3 years | Good practice | The law requires handlers to be supervised and trained, with no interval. The 3-year certificate is common | 19 Oct 2026 |
| fridge-temps | 1 week (recorded); checked daily | Recommended standard | FSA "Safer food, better business": fridge temperatures in the opening checks each day food is prepared. Recorded weekly, with the note "Check each day food is prepared; record it here once a week". **For Martin:** you had said weekly; as escape-routes | 19 Oct 2026 |
| allergens | 1 year (and on change) | Good practice | Food Information Regulations 2014: accurate at all times; no interval | 19 Oct 2026 |
| insurance | 1 year | Good practice | The policy term | 19 Oct 2026 |
| rebuild-value | 3 years | Good practice | RICS guidance: a reinstatement cost assessment every 3 years, index-linked between. Martin chose 3 years (19 Oct) | 19 Oct 2026 |
| public-liability | 1 year | Good practice | The policy term | 19 Oct 2026 |
| employers-liability | 1 year | **Legal requirement** | Employers' Liability (Compulsory Insurance) Act 1969: cover must be in force while anyone is employed. The law sets continuous cover; the yearly renewal is the policy term | 19 Oct 2026 |
| music-licence | 1 year | **Legal requirement** | Copyright, Designs and Patents Act 1988: permission is needed for non-worship music; TheMusicLicence (PPL PRS) is annual | 19 Oct 2026 |
| film-licence | 1 year | **Legal requirement** | Copyright, Designs and Patents Act 1988: public showing needs a licence; the umbrella licences are annual | 19 Oct 2026 |
| event-notice | per event | **Legal requirement** | Licensing Act 2003: a Temporary Event Notice at least 10 working days before | 19 Oct 2026 |
| cofe-architect | 5 years | **Legal requirement** | Care of Churches and Ecclesiastical Jurisdiction Measure 2018 (diocesan schemes): every church inspected at least once in every five-year period | 19 Oct 2026 |
| intruder-alarm | 6 months | Recommended standard | **The stricter is taken.** PD 6662 and BS 9263 (NSI and SSAIB): two maintenance visits a year with remote signalling, one if bells only (secondary). The note says so | 19 Oct 2026 |
| cctv | 1 year | Recommended standard | ICO CCTV guidance and the Surveillance Camera Code: review the system and its need at least annually | 19 Oct 2026 |
| key-holders | 1 year | Good practice | | 19 Oct 2026 |
| ml-notify | once (and on change) | **Legal requirement** | Terrorism (Protection of Premises) Act 2025 (standard tier, 200+): tell the regulator (SIA). The duties start after the implementation period (expected spring 2027) | 19 Oct 2026 |
| ml-plans | 1 year | Good practice | The same Act: procedures "so far as reasonably practicable", kept up to date; no interval | 19 Oct 2026 |
| ml-briefing | 1 year | Good practice | | 19 Oct 2026 |
| ml-ra | 1 year | Good practice | The standard tier has no risk-assessment duty (the enhanced tier has) | 19 Oct 2026 |
| sg-policy | 1 year | Recommended standard | Charity Commission safeguarding guidance for trustees: review the policy at least annually (law firms' summaries; the Commission's own wording was **not** seen. **To verify**) | 19 Oct 2026 |
| sg-audit | 1 year | Good practice | | 19 Oct 2026 |
| sg-recruitment | 1 year | Good practice | | 19 Oct 2026 |
| lone-working | 1 year | Good practice | HSE INDG73: no interval | 19 Oct 2026 |
| manual-handling | 1 year | Good practice | Manual Handling Operations Regulations 1992: no interval | 19 Oct 2026 |
| transport | 1 year | Good practice | | 19 Oct 2026 |
| contractors | before the work | Recommended standard | HSE INDG368 "Using contractors": check competence and insurance before work | 19 Oct 2026 |
| event-ra | per event | Good practice | | 19 Oct 2026 |
| winter | 1 year | Good practice | | 19 Oct 2026 |
| storm | after a storm | Good practice | | 19 Oct 2026 |
| ico-fee | 1 year | **Legal requirement** | Data Protection (Charges and Information) Regulations 2018: the fee is paid yearly unless exempt. The not-for-profit exemption is narrow; the ICO's self-assessment decides, and the note says so | 19 Oct 2026 |
| privacy-notice | 1 year | Good practice | UK GDPR arts. 13–14: kept accurate; ICO "review regularly" | 19 Oct 2026 |
| data-register | 1 year | Good practice | UK GDPR art. 30 (records of processing: a church processes religious belief, so it is not exempt): kept up to date; no interval | 19 Oct 2026 |
| dp-training | 2 years | Good practice | The ICO Accountability and Audit Framework says refresher training "at regular intervals", no number | 19 Oct 2026 |
| devices | 1 year | Good practice | | 19 Oct 2026 |
| leavers | when someone leaves | Good practice | | 19 Oct 2026 |
| link-safeguarding (link) | kept in Safeguarding | Recommended standard | DBS renewals and training are on the Safeguarding page, not here | 19 Oct 2026 |
| link-hirers (link) | kept in Bookings | Good practice | | 19 Oct 2026 |
| link-ccli (link) | kept in Church settings | **Legal requirement** | Copyright, Designs and Patents Act 1988: song words and streaming need the licences; renewal is yearly | 19 Oct 2026 |

**Martin's answers (19 Oct), now in templates version 3:** escape routes and fridges stay weekly with "look each day"; legionella stays 2 years, Good practice; roof and gutters 6 months; rebuild valuation 3 years; no six-monthly emergency lighting test (monthly and annual are current). Defibrillator and extinguisher walk-round stay weekly. The reviewing window's corrections: play equipment is now a weekly quick look plus a monthly working check; refuge points are tested weekly, with a 6-monthly service.

**The five as they were asked** (answered above):
1. **Escape routes and fridge temperatures:** the guidance says *daily*. They are recorded weekly with a "look each day" note. Should they have a "each day the building is used" clock?
2. **Legionella review:** Good practice, 2 years. Is that OK, or do you want a source?
3. **Roof and gutters:** twice a year (Church Buildings Council)?
4. **Rebuild valuation:** 3 years (RICS)?
5. **Emergency lighting:** add the older six-monthly test?

**To verify hardest:** the rows marked secondary or "To verify":
- refuge points
- the church EICR (5 years)
- lightning
- play
- intruder alarm
- safeguarding policy

### F-231 — Building compliance, Stage 2: the screens and the rules (Martin, 19 Oct)

**Built:**
- **`compliance.html`, for the office, the trustees and master admins:**
  - **Every building with its colour.** "Not set up yet" until the office answers about it.
  - **Checks:**
    - filters for area, status and person
    - each check labelled Legal requirement / Recommended standard / Good practice (F-232)
    - the building's safety jobs listed
  - **The building:** the plain questions. Saving them adds or removes checks, with each frequency already set.
  - **Extinguishers:** room by room, with the kind of room and the guide ("Your fire risk assessment decides; this is a guide").
  - **History:** the log.
  - **A check opens as a sheet:**
    - record it done, with a certificate or photo (Storage)
    - "Something needs doing", which raises a Maintenance job: the check, the safety tick, a due date and who
    - the church's copy: how often, who is responsible, switch off (not for a legal check)
    - a reason box when a recommended standard is lengthened
    - the "guidance changed" note
  - The church's own check, and recording building work.
- **`building.html`, "The building", Val's screens from the mock-ups:**
  - **Home:** "Hello Val", a big red "Report a problem", then Due now, Jobs to do and Coming up. Only her own checks, each with its label.
  - **A check:** done on, a photo or certificate, a note, Done, and "Something is wrong" (a safety job tied to the check).
  - **The extinguisher walk-round:** room by room, tick each one. It says "1 of 2 seen", and the record keeps each item. The guide's note shows where a suggested type is missing.
  - **Report a problem:** building, room, what. The safety tick is suggested from the words. It becomes a Maintenance job, the one list.
- **Rules (events section):**
  - **Who:**
    - compliance admins = master admins and the Church office
    - trustees = the Elders and master admins
    - assigned people = the check's `responsibleIds`
  - **Reading:** admins and trustees read everything. An assigned person reads only their checks and those checks' records.
  - **Doing:**
    - admins write the answers and the checks
    - admins, or the check's own person, add records, in their own name, never changed or deleted
    - building work is admins only
    - room kinds and the register are written by admins and read by anyone signed in
    - templates are server only
  - **The log** is append only; not even a master admin changes it.
  - **F-232's floor:**
    - A legal check can't be made less frequent, put on "only when needed", or switched off.
    - A recommended one is lengthened only with a reason.
  - **maintJobs** gains `checkId`, `safety`, `due` and `ownerId`:
    - Only an admin or the check's own person ties a job to a check.
    - Admins set the safety tick, the due date and the owner.
- **Storage:** `compliance/<site>/<check>/<file>` takes images and PDFs up to 20 MB.
  - Put up by admins or the check's own person.
  - Read by those people and the trustees.
  - Never deleted.
- **The engine:** "due soon" now fits the check. It is a quarter of the gap, at most 30 days: weekly 2 days, monthly 8, yearly 30. A weekly check done today is green, not amber all week (found by the browser walk).

**The address and test logins (emulator only):**
- **Run the walk:** `npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage --project egbc-worship-planner "node screenshots/events/compliance-stage2.test.mjs"`
- **The pages:** http://localhost:5601/compliance.html and http://localhost:5601/building.html
- **The test church:** St Example's Church, Example Hall and The Manse, all invented.
- **Logins** (password `synthetic-only-123`):
  - `olive.cmp@example.invalid`: the office
  - `eli.cmp@example.invalid`: an Elder
  - `val.cmp@example.invalid`: the caretaker
  - `vic.cmp@example.invalid`: a volunteer
  - `nina.cmp@example.invalid`: an Attender
- **Screenshots:**
  - `screenshots/events/compliance-overview-375.png`
  - `compliance-checks-375.png`
  - `compliance-check-375.png`
  - `building-home-375.png`
  - `building-walk-375.png`
  - `building-done-375.png`

**For the main window:**
- **Menu entries:**
  - "Building compliance" (`compliance.html`), for master admins, the Church office and the Elders
  - "The building" (`building.html`), for anyone a check is given to. It is simplest to show it to the Maintenance team, the office and master admins. A volunteer with nothing given sees "Nothing has been given to you yet", plus Report a problem.
- **The `buildingCompliance` switch:** still waits on `EGBCChurch.uses()` reading stored switches (F-230). The pages are not in any menu until then, so they stay out of sight. Stage 3 adds the switch check to both pages.

**Still to come (Stage 3):**
- the bookings dot
- the reminders
- the trustee report with each check's label
- "fixing a safety job marks its check done" in the same step
- the switch

### F-233 — Building compliance, Stage 3: connections and reports (19 Oct)

**Built:**
- **`functions/compliance.js`, `complianceDaily`:** runs every morning at 7 (London time).
  - **What it does for each building that is set up:**
    - writes its colour to `complianceStatus/<site>` (a colour and numbers only)
    - emails each check's responsible people "Due soon" when the check turns amber, and "Overdue" when it turns red
  - **Each reminder goes once per due date** (`complianceReminders`, server only).
  - **On the 1st of the month,** one summary of everything amber or red goes to the Church office, the Elders and master admins.
  - **Off unless the church has the add-on.** `churchSettings/features.buildingCompliance` must be exactly true, as the server already reads `features` for notifications. Off, the run writes nothing and sends nothing.
  - **Mail goes through `makeSender`,** like every other hub email.
  - **Exported from index.js.** It needs deploying at switch-over with the rest.
- **The same engine on the server:**
  - `tools/sync-compliance.mjs` copies `egbc-compliance.js` and `egbc-compliance-store.js` byte for byte into `functions/` (as `.cjs`), because only `functions/` is deployed.
  - compliance-stage3.test fails if a copy differs, so it is still one schedule engine.
- **The room bookings screen (`bookings-admin.html`):** a dot beside the site, with "Building checks: something is overdue (a warning only; bookings carry on)" and a link to the building.
  - **Shown only while the add-on is on.**
  - **Nothing about a booking reads it.** Approving, declining and moving are exactly as before.
  - **Bookings admins who are not compliance people see the colour,** never the checks.
- **The trustee report (`compliance.html`, "Trustee report and sign-off"):**
  - each building's counts, then every check with its label, how often, last done, next due, status and open actions
  - "Print or save as PDF" (the browser's print, with the buttons hidden)
  - "Download CSV"
- **The yearly sign-off:**
  - **A trustee signs off:** an Elder, or a master admin, ticks "I have reviewed the building compliance for 2026", with an optional note.
  - **What is kept** (`complianceSignoffs`): their name, the server's time and a snapshot of each building's colours.
  - **It is logged, and never changed or deleted.** The office sees the report but does not sign off.
- **Maintenance (`maintenance.html`), Martin's step:** when a job raised from a check is marked done, the page asks "Also record '<check>' as done today?". Only the people the rules let record that check are asked (the office, or the check's own people). Everyone else marks the job done exactly as before.
- **The office page** also writes a building's colour when it opens it (while the add-on is on), so the dot is fresh before the next morning.

**The proofs (compliance-stage3.test, 30/30):**
- **Add-on off:** the run does nothing, no dot shows (even with a colour on file), and a booking is approved as before.
- **Add-on on:**
  - A check made overdue on purpose turns Bea's bookings dot red, and the booking is still approved.
  - A reminder goes for the overdue check and not for the in-date one, once only, plus "due soon" when amber.
  - The monthly summary reaches the office, the trustees and master admins, not Val or Bea.
- **The report and sign-off:** the report, the CSV with labels and the trustee's sign-off all work, and the office has no sign-off.
- **The Maintenance step:** a fixed safety job records its check, and the next run turns the hall back from red.

**For the main window:** the switch is read as `churchSettings/features.buildingCompliance === true`, server and pages alike. When `EGBCChurch.uses()` reads stored switches (F-230), it should read that same field, defaulting to OFF for this one.

**Found and not fixed:**
- **Reminders are email only.** A phone notification could be added through notify.js; I did not, to keep to one channel until asked.
- **"Not recorded yet" checks get no reminder.** They have no date to be due by. They show amber on the screens and in the monthly summary.
- **The trustee report is the browser's print, not a generated PDF file.**

### F-234 — Building compliance, Stage 4: the live risk register, PEEPs and GEEPs (19 Oct)

**Labelled as Martin asked: a management tool that SUPPLEMENTS the professional risk assessments, never replaces them.**
- **The name:** it is always called the "Live risk register" (page title, heading, Menu wording to come), never "Risk assessment" on its own.
- **The banner:** Martin's banner, word for word, heads every screen of the register, every snapshot and the trustee report:
  > Live risk management: how <church> manages, day to day, the risks identified in its professional Health, Safety and Fire risk assessments. It records the checks, issues, actions and reviews that show those risks are being controlled. It supplements those assessments; it does not replace them. Your trustees remain responsible for your building's safety.
- **Kept the same everywhere:** the banner is kept once, in `egbc-compliance-templates.js` (`riskBanner`). The test holds Martin's words separately, so any change to them is caught.
- **The rules check it too:** they refuse a snapshot whose banner does not begin "Live risk management:".

**Built:**
- **`risk.html`, the Live risk register:** for the office, the trustees and master admins, building by building.
  - **The professional assessments:** the Fire and the Health and Safety reports, with their date, assessor, next review date and file.
    - **Putting one up records the review check done** (the fire or H&S review). The next review date becomes that check's due date, so the review date is itself a check, with reminders and colour like any other.
  - **Hazards:** each has a rating (likelihood × severity, 1 to 5 each: Low, Medium, High).
    - **The controls are the building's own checks.** A hazard's colour is the worst of its checks, so an overdue check turns its hazard red.
    - **Its issues are the safety jobs on those checks,** open (amber, or red past due) or resolved.
    - **A starter list** of 14 hazards, each mapped to the building's checks, can be added in one tap, then changed.
    - **Hazards are closed, never deleted.**
  - **Changes since the professional assessment:** hazards added or changed, checks changed, building work and new answers since the latest report, "to tell your assessor at the next review".
  - **Snapshots:** a trustee signs off, and a dated copy is kept in their name: the banner, the reports, every hazard with its colour, controls and issues. It can be opened and printed (or saved as a PDF), and is never changed.
  - **The GEEP:** each building's plan for visitors who need help (how they are identified, where they wait, who helps, what equipment), with a review date. The office writes it; anyone signed in may read it, because it names nobody. It shows on the fire roll-call.
- **`peep.html`, "My evacuation plan":** the person's own plan.
  - **What it asks:** what help they need, who helps, where they go, and any equipment.
  - **No medical details:** the page asks for none, and the rules allow no field for them.
  - **Only with their agreement,** given by ticking that the wardens and the duty stewards on duty may see it on the roll-call.
  - **Reviewed yearly:** the page asks them to check it once the year is up.
  - **They delete it when it is no longer needed.**
  - **Every making, change, deletion and look is logged** (`peepLog`, append only, read by master admins).
- **`functions/peeps.js`, today's plans for the roll-call:** it builds `peepToday/<day>`, rebuilt when someone checks in or out, a plan changes, the roll-call list changes, the rota changes, and every morning.
  - **Whose plans are in it:** only the people in today, meaning checked in at one of today's events (members, through their sign-up) or on today's rota.
  - **Who may read it:** the fire wardens, and the duty stewards on the rota today. A steward not on duty is not a reader.
  - **Each day stands alone:** yesterday's is deleted, and nothing is built while the add-on is off.
  - **It sends nothing.**
- **The roll-call (`checkin.html?view=rollcall`):** "People who need help to get out" lists today's plans, each opened with a tap. Each look is logged. Below it, each building's GEEP.
- **Safeguarding settings, the roll-call list:** each person is now a "Fire warden" or a "Duty steward" (`fireRollCall.stewards`).
- **Rules:**
  - **`peeps`:** read and written only by the person and master admins. A warden never reads them directly, and neither do the office or the trustees. The plan must be agreed and carry only the plan's own fields.
  - **`peepToday`:** read only by its readers and master admins; written by the server only.
  - **`peepLog`:** append only.
  - **`raReports`:** the office puts them up, the trustees and the office read them, and they are never changed.
  - **`hazards`:** the office keeps them (ratings 1 to 5); the trustees read them; never deleted.
  - **`riskSnapshots`:** the trustees take them, with the banner; never changed.
  - **`geeps`:** the office writes them; anyone signed in reads them.

**Martin's three proofs, in compliance-stage4.test (35/35):**
- **A warden sees a PEEP only for someone in today.** Pat (checked in) and Rob (on the rota) are shown, Quinn (not here) is not, and Pat drops off when she checks out.
- **A steward not on duty doesn't see them.** Stan opens the roll-call and sees no plans, and the rules refuse him. Sue, on the rota today, sees them.
- **A PEEP never appears in any email.** The test checks every email the compliance run makes, including a reminder to a warden who reads plans, and that no server file but `peeps.js` reads the plans (`peeps.js` sends nothing).

**Read as the brief allows, and not done:**
- **A warden named for one building sees today's plans for every building** (each entry names its building). Narrowing them by building is a small step if Martin wants it.
- **Children's plans are not included.** Children are checked in by their leaders, and a child cannot agree to or edit their own plan; their care plans stay with Kids Church. Leaders checked in as walk-ins (with no sign-up) can't be matched to a plan unless they are on the rota.
- **No phone notification about plans.** That is deliberate: they are never sent anywhere.
- **For the main window:**
  - Menu entries for "Live risk register" (`risk.html`, office, Elders and master admins) and "My evacuation plan" (`peep.html`, anyone in the address book).
  - The same `buildingCompliance` switch.
- **For Martin to deploy at switch-over:** the rules and the `peepToday*` functions. The functions start doing anything only once the add-on is switched on.

### F-235 — Must-fix: nothing private is saved before switch-over; plans by building; "entered by" (19 Oct)

**Why.** The reviewing window found that peep.html was live on GitHub Pages, ungated, and saved to `/peeps`. Until switch-over, though, the live database is readable signed out, and a PEEP is disability information. They checked live: peeps, peepToday, peepLog, hazards and reports were all empty, so nothing was exposed.

**Fixed:**
- **One gate for all four pages** (compliance, building, risk, peep): `EGBCComplianceStore.gate()` reads the same two settings as the other private forms.
  - **The add-on switch, `churchSettings/features.buildingCompliance`.** Unless it is exactly true, each page shows only "Building compliance is not switched on for this church."
  - **The locked rules, `churchSettings/launch.rulesLocked`** (egbc-launch.js). Until it is exactly true, every private write in Stages 2–4 is held, and the page says why, with nothing to type into or upload:
    - **peep.html:** no form at all; "please tell a steward or the church office in person".
    - **risk.html:** read only. No report upload, no hazards (adding, the starter list or changing one), no snapshot, no visitors' plan to write.
    - **compliance.html:** no certificate or photo upload.
    - **building.html:** no check record or photo. "Report a problem" still goes to Maintenance, exactly as the live Maintenance page already does.
- **Plans by building** (Martin): the server now writes `peepToday/<day>__<siteId>`, one list per building.
  - **Readers of each list:** the wardens named for that building or for every building, and that building's duty stewards who are on the rota today.
  - **Which building:** a person checked in counts for the building of their event; a person on the rota counts for the rota event's building. The rota has no building today, so that is the church's first building (Places order).
  - **The roll-call** reads only the buildings in the person's scope, and the rules refuse the rest.
- **Entered by** (Martin): a master admin can choose "Whose plan?" on peep.html and enter a plan for someone, with their agreement.
  - **What the rules require:** `enteredBy` (their own uid) and `enteredByName`.
  - **Where it shows:** the plan reads "Entered by <name> with their agreement" (the person sees "with your agreement"), and so does the roll-call.

**Proved:**
- **compliance-gate.test (17/17):** on the live-like setup (rules not locked):
  - signed out, there is no form
  - signed in, each page explains why and has no inputs
  - nothing is written: no plans, reports, hazards, snapshots or records, and nothing in Storage under `compliance/`
  - with the add-on off, all four pages show only the "not switched on" line
  - once rules are locked, the form appears
- **compliance-stage4.test (41/41):** Hal, a warden for the hall only, sees no church plans and the rules refuse him the church's list; Martin's entry for Quinn is recorded and shown to both.
- **Rules:** a master admin's entry without "entered by", or in someone else's name, is refused.

### F-236 — Rooms: photos and kit where a room is booked; the area as given; Martin's photos, sizes and plans (19–20 Oct)

**1. The room at a glance where it is booked** (the reviewing window: §6.18).
- **The gap:** Martin saw no photos or equipment on the booking pages. The members' booking (rooms.html, which the app's "Book a room" opens) and the public hire form (book.html) never showed the room.
- **Now the shared form (`egbc-events-bookform.js`) shows a card for each chosen room,** drawn by `EGBCRooms.card()` (`egbc-events-rooms.js`), the same facts as room.html:
  - the main photo (a grey square where there is none)
  - how many it holds set out the way asked ("Holds 80 set out cabaret", or "Holds up to 170"); it changes with the layout
  - the floor area
  - the facilities, with icons
  - the kit in the room, and the kit that can be brought in (movable, same site)
  - "More about this room"
- **The kit is shown to church members only,** because the rules keep `bookableResources` to them. A hirer on book.html sees the room without it.
- **It fits at 375px.**

**2. The area as given** (Martin, 19 Oct). `dims.area`, for an L-shaped room, a room with a bay or an architect's figure, wins over length × width, everywhere.
- **On the room pages:** `EGBCRooms.area`.
- **In Places:** a "Floor area as given (m², optional)" field and "About the size" (`sizeNote`), shown on room.html beside the size.
- **Kept when saved:** saving a room in Places keeps both (tested). Emptied, the area is worked out from length × width again.

**3. `tools/room-photos.mjs`** (dry run first; `--live --write` with Martin's OK):
- **Photos:** made smaller exactly as Places does (its own `shrink()`, in Chrome) and stored where Places stores them, the first being the main one. Each remembers its file, so running twice adds nothing twice.
  - **Live since 20 Oct** (run by the reviewing window with Martin's OK): Sanctuary (sanctuary-inside, outside-rear-hall), Creche Room (lounge-sofas), Upper Room – Side and Upper Room (upstairs-folding-doors).
- **`--sizes`:** Martin's measurements (from the 2013 plan's 1:50 scale bar, about ±0.1 m; ceiling heights and the fire-safety maximum left empty).

  | Room | Length × width | Area | Note |
  |---|---|---|---|
  | Sanctuary | 12.6 × 10 m | 132 m², the architect's | Plus a 2.4 m dais at the front; theatre layout 170 |
  | Upper Room | 11.4 × 7.2 m | 62 m², as given | L-shaped |
  | Upper Room – Front | 6.5 × 7.2 m | 43 m², as given | Less the lift corner |
  | Upper Room – Side | 5.0 × 3.8 m | from length × width | |
  | Creche Room | 5.5 × 3.7 m | from length × width | |
  | Youth Room (rear) | 5.0 × 4.1 m | 21 m², as given | Plus a small bay |
  | Kitchen | 3.7 × 2.9 m | from length × width | |

  **This can now go live** (`--live --write --sizes`), since Places keeps the area as given.
- **`--plans`:** each room's own plan (sizes marked, scale bar).
  - **Where:** stored at `roomPlans/<room>/`, never the public `rooms/`, and no download link is kept on the room. Each is "members and office" by default (`floorPlanWho`).
  - **When:** the tool refuses until `churchSettings/launch.rulesLocked` is true, i.e. after switch-over.
  - **Still to come:** the storage rule and the "who sees the floor plan" setting in Places are the next job.
- **`--hire`:** the church's own picture (outside-front.jpg) as the "Hire our rooms" header.
  - **Where it is kept:** `churchSettings/hire`, its own document, because saving Church settings replaces `details` whole and would wipe it.
  - **Not yet live:** `--live --write --hire` with Martin's OK.
- **Room names match whatever the dash:** the live names use an en dash ("Upper Room – Front").

**4. The 2013 floor plan's numbers and the hub's rooms** (Martin confirmed, 19 Oct). Keep these tied: the room plans, "where to find it" and the GEEP all rest on them.

| On the 2013 plan | The hub's room | Floor |
|---|---|---|
| 1 Main Hall | Sanctuary | Ground |
| 2 Kitchen | Kitchen | Ground |
| 3 Lounge | Creche Room | Ground |
| 4 Meeting Room (by the Pastor's office) | Youth Room (rear) | First |
| 5 Snug | Upper Room – Side | First |
| 6 Front Room | Upper Room – Front | First |
| 5 + 6 opened up | Upper Room | First |
| (not on the plan) | Upstairs Kitchen, Garden | |

- **The Sanctuary is ONE room:** "Room G1" is the architect's label for its back half; there is no divider in use.
- **The pictures and plans stay off the public repo:** they live in Martin's OneDrive (Documents\New hub\rooms, and plans\).

**Proved:**
- **room-card.test.mjs (25/25), with 9 breaks caught:**
  - **rooms.html:** card, photo, holds and layout, facilities with icons, kit in and movable, a second room's own card, no sideways scroll
  - **book.html signed out:** the card without kit
  - **The tool on the emulator:** photos shrunk to 1600 px, en dashes, sizes, the plans held then put up privately, the hire header, nothing twice
  - **Places keeps the area as given and the note,** saves a changed note, and the room page shows them
  - **The hire header shows**

### F-237 — ChurchShow: each computer paired on its own (from the main window, 19 Oct; Martin)

Martin, 19 Oct: the main hall PC and the Kids Church laptop were one connection, so Disconnect
switched off both. Now `functions/churchshow.js` pairs each computer separately:
- **A new computer** gets its own identity, `churchshow-<siteId>-<random>`, with a name
  ("Main hall PC"). There can be several in a building.
- **Disconnect** (`{ deviceId }`) and the new **`churchShowRename`** act on one computer.
  `churchShowPairingCode({ deviceId })` pairs the same computer again.
- **What was paired before keeps working.** `churchshow-<siteId>` is just one of the devices
  ("Paired before 19 Oct 2026" on the page until someone names it).
  `churchShowDisconnect({ siteId })` still means that old connection.
- **The claims and the device document are as before:** `device: 'churchshow'`, `siteId`, and
  `devices/<uid>.active`, read by the rules' `churchShow()` with no change.

**lessonFor:** nothing to change. It already reads `devices/<token uid>` and takes `siteId` from
it, so each computer gets its own building's lessons, and disconnecting one stops only that one.
Only its header comment still says `(churchshow-<siteId>)`; it could say "the paired computer's
own device". check-churchshow-pairing.mjs proves two computers in one building are independent
(66/66, and a deliberate break caught).

**Deploy:** functions:hub (`churchShowPairingCode`, `churchShowDisconnect`, the new
`churchShowRename`). No rules change.

**ADDED THE SAME DAY: each computer's JOB (Martin, 19 Oct).** A master admin sets it on
churchshow.html: "Main services" and/or "Lessons" for chosen plan groups.
- **Where it lives:** `devices/<uid>.jobs = { services: bool, lessonGroups: [planGroups ids] }`.
  The claims carry it too (`services`, `lessons`), from the next token.
- **Default:** a record with no `jobs` (everything paired before) does main services and **no**
  lessons. `jobsOf(d)` in functions/churchshow.js normalises it; import it rather than
  re-reading the shape.
- **Services side, done:** a new `churchShowServices()` in the rules gates `services`, `songs`,
  `songSummaries` and `events` for devices. A Lessons-only computer reads none of them.
  Rules tests cover it (1501/1501, break caught). `screenPages` still uses `churchShow()`.
- **Changing a job** is `churchShowSetJob`, master admins only. Proved in
  check-churchshow-pairing.mjs (74/74, break caught).

**For you, please (lessonFor, functions/lesson.js):** respect the job.
- Read `jobsOf(devices/<token uid>)`.
- Give only the lessons of groups in `lessonGroups`: drop other groups, and refuse a
  `groupId` that isn't in the list.
- Refuse a computer whose `lessonGroups` is empty (services only, which every existing pairing
  is): "This ChurchShow computer is not set up for lessons - a master admin can change that on
  Connect ChurchShow."
- Read the device record on each call (not the claims), so a change takes effect at once.
- Tests and a break on your side, please.

### F-238 — Your F-230: feature switches done; the two registers' fields, to agree (from the main window, 19 Oct)

**EGBCChurch.uses() reads the stored switches now.**
- `EGBCAuth` reads `churchSettings/features` with the profile, so every page has it and the Menu
  draws once, right.
- `EGBCAuth.uses(name)` answers: the stored `true`/`false` if there is one, otherwise the
  feature's default. `EGBCChurch.uses` asks it.
- **Off by default:** `sessionPlanner`, `buildingCompliance`, `enews`, `cardMaker`, `canva`.
  Everything else is on by default.
- **Switching:** a master admin switches each one on Church settings ("What does your church
  use?"). It saves as pressed, and the rules allow only the known names.
- **For you:**
  - The session planner is off until Martin switches it on, so your session-planner and
    sermon-planner tests need `churchSettings/features.sessionPlanner = true` in their set-up.
  - A new add-on's name must go on the list in two places: `FEATURES` in egbc-auth.js and the
    `features` rule. Ask me, or add both in one commit.
  - Proved: check-features.mjs 9/9 (a break caught), the rules tests, and check-menu with the
    switch.

**1. Inventory as the church-wide ASSET REGISTER.** It extends `inventory/{id}` in place (the
page is mine).
- **Kept as they are:** name, serial, description, condition, location (text), category,
  manualValue, aiValue, photoUrl, status in/out, signLog, lastSignedBy.
- **Added:**
  - `siteId`, `roomId` (from Places).
  - `ownerTeam` (whose it is: AV, Worship, Kids Church, Kitchen…; existing items become
    "AV Team").
  - `makeModel`.
  - `purchasedOn` (YYYY-MM-DD), `purchaseCost` (pence), `insuredValue` (pence),
    `warrantyUntil`.
  - `checks: [{ kind: 'PAT'|'service'|'inspection'|'other', everyDays, lastDone, nextDue,
    notes }]`.
  - `disposedOn`, `disposedReason`, `archived`.
- **Categories:** AV, Music, Kitchen, Furniture, Building, IT, Kids, Other.
- **Who:** master admins, the Church office, and the admins of `ownerTeam` edit; anyone on a
  team reads.
- **Building compliance (yours):** checks on the building itself (fire alarm, emergency lights,
  fire doors) stay in your collection. Equipment checks (PAT, servicing) live on the asset's
  `checks[]`. Your "checks due" screens list both, by `nextDue`, and when a check is done
  (whoever does it) both `lastDone` and `nextDue` are written. Agree?

**2. The INFORMATION ASSET REGISTER (UK GDPR record of processing),** one list shared by
retention.html and my privacy tools: `infoAssets/{id}`.
- **Fields:**
  - `name` ("Address book"), `collections: ['addressBook', …]`, `purpose`.
  - `lawfulBasis`: consent | contract | legal obligation | vital interests | public task |
    legitimate interests.
  - `specialCategory` (bool), with `specialCondition`.
  - `dataSubjects`: members, children, parents, visitors, hirers, donors.
  - `fieldsHeld` (list), `access` (roles).
  - `retention: { keepFor: <days>, from: 'created'|'lastActivity'|'eventEnd'|'leftChurch',
    then: 'delete'|'anonymise'|'review' }`, and `retentionKey` (the name retention.html already
    uses for that rule, so nothing of yours renames).
  - `processors` (Google Firebase, Stripe, GoCardless, the mail sender, YouTube…),
    `whereHeld` ('UK/EU').
  - `owner` (a role, not a person), `reviewedOn`.
- **Who:** master admins and the Church office edit; the safeguarding lead reads.
- **retention.html** reads `retention` from here, instead of its own constants, once the list
  exists.
- **My privacy tools** (Backup's "what we hold about someone", and the subject access export)
  read the same `collections` and `fieldsHeld` to know where to look.
- I'll seed it from what the hub actually holds.

Reply with changes, or "agreed", and I'll build my side: the register pages, the rules, the
seed and the Inventory changes.

**Your F-231/F-233 Menu entries, done (main window, 19 Oct):**
- "Building compliance" (`compliance.html`) for master admins, the Church office and the
  Elders.
- "The building" (`building.html`) for the Maintenance team, the Church office and master
  admins.
- Both are under Events and rooms, behind `buildingCompliance`. That switch is off until a
  master admin switches it on in Church settings: `EGBCAuth.uses('buildingCompliance')` reads
  `churchSettings/features.buildingCompliance`, the same field as your server.
- The app's tiles ("The building" mode) come with the start screen, once Martin approves the
  mock-ups in design-mocks/app-start.

### F-243 — The members' room page; private floor plans; the card's photo full width (20 Oct)

**From Martin's live check at 412px:**
1. **BUG, fixed.** "More about this room" on the members' booking opened room.html, which refuses any room not for hire. No room is for hire yet, so it was a dead end for every room.
   - **The members' booking now links with `&member=1`.** room.html then asks who is signed in.
   - **An active church member, or the office** (admins, the site's bookings admins), gets the full page for any active room, for hire or not:
     - photos, size, layouts and facilities
     - **the kit** in the room and what can be brought in
     - **the floor plan** as the room's `floorPlanWho` allows
     - **"Book a room"** (the members' booking), not the hirers' form
   - **Without `member=1` room.html stays the public, hire-only page.** Signed out, `member=1` shows nothing but the sign-in.
2. **The card's photo is the card's full width on a phone,** at its own shape, and loads lazily. At 700px and wider it sits beside the words.

**Private floor plans.** A Storage rule at `roomPlans/<room>/`:
- `floorPlanWho` **'public':** anyone
- **'members' (the default):** anyone signed in and active, and the office
- **'office':** admins and the site's bookings admins
- **Who puts them up:** admins.
- **Two guards, each tested on its own:** the page asks only when allowed, and Storage refuses anyone else.
- **What goes up and when:** the tool's `--plans` puts them there only after switch-over. The Places setting for `floorPlanWho` is the next job (with the "fill in your rooms" checklist and "where to find it").

**Live** (the reviewing window ran the tool with Martin's OK): the sizes for all 7 rooms, the Sanctuary's theatre 170, and the hire header. Floor plans are still held. "Holds 80 set out cabaret" was emulator test data only; no layout figure is ever invented live.

**The tool and the test now use the pages' own bucket** (`egbc-worship-planner.firebasestorage.app`) everywhere. The test had found plans put up off-live landing in a different bucket from the one the pages read.

**Proved:** room-card.test 40/40. As a member:
- **Every room opens:** each of the 7 rooms' "More about this room" goes to the members' page, and every one opens, for hire or not.
- **The page:** kit is shown, the button is "Book a room", and a members' plan is visible.

The other side:
- **Signed out:** a room not for hire is refused on the public page and not shown at the members' address, and Storage refuses the plan.
- **Office only:** a member doesn't see the plan and Storage refuses her, while a master admin does see it.
- **Public:** the public page shows the plan, signed out.
- **The photo:** full width at 375px on both booking pages, lazy.

5 breaks caught. The one that matters: members sent to the hire-only page.

**r1-rooms updated to the agreed default:** a floor plan is kept back from the public page unless the room says "public".

### F-239 — Feature switches: one answer, page and server (from the main window, 20 Oct; the reviewing window)

**The mismatch.** Live `churchSettings/features` is empty. The pages take each switch's default
(every switch on at EGBC, Martin 19 Oct), but these read the stored field and want
`buildingCompliance === true`, so to them it is OFF:
- `functions/compliance.js` `featureOn` (complianceDaily; `functions/peeps.js` peepToday imports it);
- `bookings-admin.html` (the bookings dot);
- `egbc-compliance-store.js`;
- `compliance.html`.
`functions/public-mail.js` reads the switches itself too (as "on unless stored false", which agrees
today, but it is a second list of rules).

**Done on my side.**
- `functions/features.js` is the server's one list and reader: `featureOn(db, name)`,
  `uses(switches, name)`, `FEATURES`. Same names, same defaults, same rule as `EGBCAuth.uses`.
  feeds, notify and rotaWhatsOn use it now.
- `tests/check-features-agree.mjs`: the two lists match, and for every switch (stored on, off,
  nonsense, not stored) the page and the server give the same answer. It also lists any file
  that reads `churchSettings/features` itself; yours above show as WAIT (F-239).
- `tools/store-feature-defaults.mjs` (Martin runs it, dry run first) writes each unstored switch's
  default into the live document, so your current code agrees today too.

**For you, please (your files):**
- Functions: `import { featureOn } from './features.js'`, then
  `featureOn(db, 'buildingCompliance')`. In compliance.js, `featureOn(db)` can simply call it, so
  peeps.js follows. public-mail.js: the same, in place of its own `featureOn`.
- Pages: `!window.EGBCChurch || EGBCChurch.uses('buildingCompliance')` (or `EGBCAuth.uses`), not
  a `.get()` of the document.
- Then take each file off `WAITING` in check-features-agree.mjs. The check fails if a file on
  that list no longer reads the switches itself, so it reminds you.
- A new switch still goes in three places in one commit: `FEATURES` in egbc-auth.js,
  `FEATURES` in functions/features.js, and the `features` rule. The check catches the first two
  disagreeing.

### F-240 — Fill in your rooms; step-free access four ways; which floor; floor plans in Places (20 Oct)

**Martin's answers (20 Oct):**
- **The enquiry email** (martin@prosserconsulting.uk) is his, for testing, on purpose. SWITCHOVER-events.md 3.1 now says: "Church settings > enquiry email -> the church office address".
- **"How many it holds"** with no layouts now falls back to "Holds up to <capacity>" on room.html, as the booking card does (Creche Room: 14).
- **Step-free access is now four ways** (`room.access`): Step-free, Step-free by the lift, Not step-free, and Not checked yet.
  - **A room nobody has set shows "Not checked yet",** never "No". The old tick still reads as step-free.
  - **Places** has a select for it, and the room list and room.html say it in words.
- **`tools/room-photos.mjs --access`** (dry run first; the reviewing window runs it live):
  - Sanctuary, Kitchen, Creche Room: step-free
  - Upper Room, Upper Room – Front, Upper Room – Side, Youth Room (rear), Upstairs Kitchen: step-free, by the lift
  - Garden: left "Not checked yet"
  - The live dry run finds all 8.

**Built:**
- **"Fill in your rooms" in Places** (above the room list), for each room in use, with "Fill in" opening its profile and "N of M rooms have everything" at the top. It says what is still missing:
  - a main photo
  - its size
  - how many it holds
  - its facilities
  - a description
  - step-free access (not checked yet)
  - which floor it is on
  - the fire-safety maximum (from the fire risk assessment)
  - a floor plan
- **Where to find it:** each room's floor (`room.level`: ground, first, second, lower ground, outside), set in Places and shown on room.html.
- **Who sees the floor plan** (`floorPlanWho`), set in Places: anyone, members and the office (the default), or the office only. The storage rules already enforce it (F-243).
- **Floor plans put up in Places** now go to the private `roomPlans/<room>/`, with no public link kept on the room. Places shows them through Storage. Until switch-over Places offers no plan upload and says why.

**Not done yet** (asked for on 19 Oct):
- **A crop of the whole-building plan with each room marked,** for "where to find it". This needs each room's box on Martin's whole-building plan. I will add it to the tool as `--where`, held until switch-over like the plans, since they are members and office only.
- **The GEEP's link to the whole-building plan** (office and wardens only, after switch-over).

**Proved:** room-card.test 55/55, three clean runs in a row. Its new checks:
- the checklist and its flags
- "Fill in"
- saving the floor
- `--access`, including leaving the Garden and running twice
- the room page saying "Step-free", "Step-free, by the lift" and "Not checked yet", never "No"
- "Holds up to 14"
- "Outside"
- no plan upload before switch-over
- a plan put up in Places at the private path, and "who sees it" saved

**7 breaks caught.** The one that matters: a room nobody has checked saying step-free "No".

**A flaky check found and fixed:** book.html's card was sometimes checked before its photo appeared. The test now waits for the photo itself.

**r1-rooms updated:** it now tests Places after switch-over (rules locked). Its plan goes to the private roomPlans/, and its photos stay in rooms/.

### F-241 — The app's start screen: "The building" mode; two small things on your pages (from the main window, 20 Oct)

**The start screen is in the app** (design-mocks/app-start; the reviewing window, 20 Oct).
- Opening the app asks "What are you doing?" with tiles: Sunday worship, Kids and youth,
  The building, Church office and Just me. Each person sees only their own tiles. Someone with
  only one tile, or only one team, skips the screen.
- **The building** mode holds a new `building` space plus the Maintenance space. It is offered to
  whoever the Menu gives The building, Building compliance or the Live risk register
  (`EGBCMenu.forPerson`, so the `buildingCompliance` switch counts too).
- Its Checks tab opens those three pages in app mode. Nothing of yours changed.
- **The mock's Building Home isn't built yet:** checks due, repairs and rooms today. It would read
  your compliance store. If you'd like to supply a function that returns "checks due for
  me" (title, due date), the Home can use it.

**Two small things on your pages:**
1. **check-style-every-screen: bookings-admin.html, "day view", 10 findings.** The "←" button is
   counted as an emoji, and the "07:00" time labels are 11px. Lucide's `arrow-left` and 12px would
   clear them.
2. **FINDINGS numbering:** your members' room page note (22465c9a) is headed **F-237**, which is
   already my ChurchShow note (line ~8029). Please renumber yours. F-238, F-239 and F-241 are mine.

### F-242 — PRESENT: one engine for the session planner and video meetings: PLAN (Martin, 20 Oct) - for review before building

**What Martin asked for:** Teams' "PowerPoint Live", in our own meetings and on the session TV. It is a headline feature ("a selling point on its own"), so it must be polished, not a basic share.
- Everyone moves to the next slide smoothly and at the same moment.
- It works on weak church Wi-Fi.
- The presenter sees the slide, what's next, their notes, a timer, and the people's faces (and any raised hands).
- There is a 2-minute "how to present" guide.

**Mock-ups** (invented content; screenshots/events/):
- **The people in the meeting:**
  - `present-mock-viewer-desk.png`: the slide large, the faces in a strip beside, a progress line, "Following Martin"
  - `present-mock-viewer-browse.png`: looking back on your own, with "Back to presenter"
  - `present-mock-viewer-375.png`: on a phone, the slide on top and the faces below
- **The presenter:**
  - `present-mock-presenter-desk.png`: everyone sees this; a thumbnail strip; up next; notes; total and per-slide timer; the faces with "1 hand up"; big Next, Back and Stop
  - `present-mock-presenter-375.png`: the same on a phone, with the faces in a sideways strip
- **`present-mock-takeover-375.png`:** a second person takes over.
- **`present-mock-guide.png`:** "How to present", five steps.

**1. One engine: `egbc-present.js`.** It is used by two hosts:
- **The session planner:** `present.html?s=...` on the TV or laptop, and the leader's phone as the remote (F-223 Part 2). Slides are one kind of step there, beside Bible verses, video, YouTube, pictures, text, timer and the quiz.
- **A video meeting:** `meeting.html` (the main window's page) mounts it through a small hook (section 6).

The engine draws the stage, the presenter view, the browse-on-your-own mode, take-over, the keys and clicker, and preloading. The hosts only say who may see and who may present.

**2. Where the slides come from.** I recommend **(b+), which needs no server and works for any church:**
- **Save your slides as a PDF** (PowerPoint, Keynote, Google Slides and LibreOffice all can) and add it.
  - **It becomes pictures in the browser** (pdf.js), one per slide: 1920 px for the screen, plus a 320 px preview.
  - **About 150-300 KB a slide.**
- **Add the .pptx as well, and the speaker notes come with it.** They are read in the browser from the file itself (it is a zip; JSZip), matched to the slides. No PowerPoint notes? You can type notes per slide.
- **Or a folder of pictures** (PowerPoint's "Export as PNG").
- **What a church without Microsoft 365 gets:** everything. PDF export is in every presentation app. Nothing here needs Microsoft.
- **(a) A server converter** (LibreOffice on Cloud Run, .pptx straight to pictures) is for later, only if churches find the PDF step a nuisance.
  - It costs a little to run, and you would deploy it.
  - Fonts may differ from PowerPoint's.
  - Until then, a .pptx added on its own gives the notes, and the page asks for the PDF too.
- **A OneDrive link** (Martin's answer 6, F-225) stays for the session TV: Microsoft's own player, with animations and video in slides, and the clicker drives it.
  - **In a meeting it cannot be shared slide by slide:** Microsoft's player runs separately on each person's screen, and nothing tells the others which slide the presenter is on.
  - **So in meetings the PDF route is the shared one;** a OneDrive link shows as "Open the slides" for everyone to follow on their own.

**3. Kept in step: one tiny shared state.** It is a single document, `presentNow/{key}`:
- **`key`:** `ps_<sessionId>` for a session, or `mtg_<room>_<event id, or the date>` for a meeting.
- **What it holds:** `deckId`, `slide` (or `step`), `presenterUid` and name, `startedAt`, `slideAt`, and `blank`.

**How the change reaches everyone:**
- **The presenter's Next writes one number.** Everyone's screen hears it at once, in a fraction of a second, and crossfades (0.2 s) to a picture it already has.
- **Weak Wi-Fi:** the whole deck is fetched in the background when it opens, smallest previews first (12 slides is about 3 MB), so a slide change downloads nothing.
- **If a full picture isn't there yet,** the preview shows and sharpens.
- **If the Wi-Fi drops,** the screen keeps what it has, and catches up on the right slide when it's back.
- **No video stream is involved at all** (no screen share).

**Browse on your own:** look back or ahead on your own screen only, then **"Back to presenter"**.

**Take over:** a second person (for a meeting, an invitee; for a session, any of the group's leaders) presses "Take over presenting". The first presenter sees "Karen is presenting now".

**4. The presenter view:**
- the current slide ("Everyone sees this")
- next
- notes
- the timer: total, and on this slide
- a thumbnail strip to jump
- Next and Back (also the arrow keys, the space bar and a clicker)
- Blank
- Stop presenting
- **the faces, with raised hands** (Martin, 20 Oct): on a computer in a panel, on a phone in a sideways strip

**5. In a meeting:**
- **On a computer:** the slides large, the faces in a strip beside.
- **On a phone:** the slides on top, the faces below.
- **No screen share.**
- **The faces are Daily's.** Two ways:
  - **Step 1, quick and safe:** keep Daily's ready-made screen (Prebuilt) and narrow it into the strip. It shows its own tiles, raised hands, mute and controls, but in Daily's look, not ours.
  - **Step 2, the polish in the mock-ups:** our own tiles from Daily's call object, with names, the presenter's green edge and the gold "Hand up" badge. Hands are raised through Daily's own raise-hand state.

  I recommend Step 1 first and Step 2 straight after. Step 2 is what makes it look like the mock-ups, but it changes more of meeting.html.

**6. The hook in meeting.html (the main window's page: please agree or counter):**
- **A "Present" button.** It is shown to anyone who may present in the room (section 7).
- **`EGBCPresent.attachMeeting({ room, eventId, el: <a div beside #stage>, call: frame })`.** The engine listens to `presentNow/mtg_...`. While someone is presenting it adds `body.presenting`, and meeting.html's CSS turns the page into the slides plus the strip (Step 1: the Daily iframe becomes the strip). When they stop it removes the class, back to the faces.
- **In all:** about 10 lines and the CSS in meeting.html, and the rest in my file. For Step 2, the call object, we would agree more: I would draw the tiles, and you would keep the join, admit and leave logic.

**7. Private** (meeting decks may be confidential, e.g. the Eldership):
- **Decks:** `presentDecks/{deckId}` = { name, `context` (a meeting: room and event; or a session: group), slide count, made by }. The pictures go at `present/{deckId}/...` in Storage.
- **Who may read them:** only the meeting's invitees (for a session, the group's leaders and team), by the rules and by Storage. That needs one rule function from the main window: **`meetingInvitee(room)`**, the same "is it mine" test meeting.html uses today (e.g. the Eldership room for the Elders). Please add it in your part of the rules, and I will call it.
- **Held until going live:** today the live database and Storage are readable signed out. So, as F-235, until `churchSettings/launch.rulesLocked` is true, "Add slides" says why and uploads nothing. A OneDrive link works meanwhile: the file stays in Microsoft, under its own sharing settings.
- **A meeting deck is deleted after the meeting** unless the presenter keeps it (question 3).
- **Notes are the presenter's only:** they are kept in a separate document, read by whoever is presenting, never by viewers.

**8. "How to present"** (mock): five short steps on one screen, reached from the Present button and the planner.

**What it needs from Martin:** nothing to switch on. Present uses the normal sign-in, not anonymous sign-in (the quiz's phones mode will; I will say when).

**The order I suggest:**
1. The engine, plus present.html for sessions (TV and the leader's phone), with the PDF route and notes from the .pptx.
2. The meeting hook (Step 1), once the main window agrees section 6 and adds `meetingInvitee`.
3. Step 2, our own tiles.
4. Then the quiz (Part 3).

Each with tests (two browsers following one presenter; Wi-Fi dropped and back; take-over; a non-invitee refused the deck and its pictures; nothing uploaded before switch-over), breaks and 375px, and stopping for review after Present.

**Questions:**
1. In meetings: Daily's ready-made tiles first (Step 1), then our own (Step 2)?
2. Who may present in a meeting: any invitee, or the host (with any invitee able to take over when the host allows)?
3. Meeting decks: deleted when the meeting ends unless kept, or kept for a set time?
4. A OneDrive link in a meeting: is "everyone opens it themselves" enough, with the PDF the shared route?

### F-245 — building.html: open the check its address names (from the main window, 20 Oct; the reviewing window)

**Switch is quick now** (the reviewing window, 20 Oct). In the app, and on every page the app opens,
"Switch" sits top right and opens a small sheet of the person's own modes; one tap goes there.
Each mode remembers where it was for the visit, **including the page and its address**. Val can now
go from a check on building.html to the Church office in two taps, and back to building.html in two.

**What only you can add: "back to the same check".** building.html doesn't put the open check in
its address, so she comes back to the building page's list, not the check. Please:
- On load, `?check=<id>` opens that check (as tapping it does), if it's one of hers.
- Opening a check: `history.replaceState` adds `?check=<id>` (keep `app=1` and anything else).
  Back to the list takes it off.
- The app's building Home already links each due check as `building.html?check=<id>`.

tests/check-app-start.mjs shows **WAIT (F-242)** until building.html handles `check=`. After that,
it checks the same check is open on return.

**Also, please, when convenient:** a shared `EGBCComplianceStore.myDue(db, memberId, today)` that
returns your `schedule()` items for the checks given to this person. The app's building Home does
building.html's load() steps itself for now, through your `EGBCCompliance.schedule()`, so the answer
is the same; one function would keep it that way.

### F-246 — Every part has a switch: your pages, and "this device" (from the main window, 20 Oct; the reviewing window)

**13 new switches, all on at EGBC:** maintenance, events, roomBookings, kids, smallGroups, forms,
payments, safeguarding, pinBoards, meetings, notices, churchShow and availability. They're in both lists
(egbc-auth.js and functions/features.js), the rules' names and Church settings.

**What follows them now, on my side:**
- The Menu: each page carries its `feature`.
- The app: its rows, tabs, sheets, the bell and every Home, using the Menu's own answer.
- The hub's cards and links.
- notify.js: bookings, maintenance jobs, urgent notices, and DBS/training reminders.

Switched off, a part is hidden; nothing is deleted. tests/check-switches-off.mjs proves it with
all 13 off, then back on.

**For you, please (your pages):**
1. **Name each page's part** on its guard, so a bookmark to a switched-off part gets a kind
   "switched off" card, not the page: `<script src="egbc-guard.js?v=…" data-feature="…">`. It's new
   today; stickynotes.html, churchshow.html and give.html have it.
   - **events:** events-admin, checkin, attendance, headcounts.
   - **roomBookings:** rooms, bookings-admin (hire.html and signup pages have no guard: your call).
   - **maintenance:** maintenance.
   - **kids:** kids-admin, kids-checkin.
   - **smallGroups:** groups-admin. **forms:** forms-admin.
   - **safeguarding:** safeguarding, safeguarding-settings, retention.
   - **payments:** payments.
2. **public-mail.js and your other senders:** `featureOn(db, 'events')` (sign-up emails) and
   `featureOn(db, 'roomBookings')` (booking and hire emails), from ./features.js, as F-239.
3. **notifications.html (yours): changed by me on the reviewing window's instruction** (Martin:
   notifications work on a computer too, so never "this phone").
   - "this device" throughout.
   - The blocked help now shows only this device's steps: Chrome, Edge, Safari on a Mac or Firefox
     on a computer; Android or iPhone on a phone (`EGBCNotifyPage.blockedHelp(ua)`).
   - tests/check-notify-device.mjs covers it.
   - **Your screenshots/events/notify.test.mjs still expects the old words.** Line 144 "On for
     this phone" and line 190 "blocked on this phone" become "this device"; line 190's Android
     steps now start "On Android in Chrome:".

### F-247 — "Present slides" in a call: the hook in meeting.html; VIDEO_BASE in places-admin.html (from the main window, 20 Oct; the reviewing window)

**Present: your F-242, section 6. Agreed, as you wrote it.**
- meeting.html calls `EGBCPresent.attachMeeting({ room, eventId, el, call })`: `el` is a div beside
  the call, and `call` is Daily's frame. Then `body.presenting` drives the layout in meeting.html's
  CSS.
- Step 1 (Daily's ready-made tiles in the strip) first. Step 2 (our own tiles) after; then I keep
  join, admit and leave, and you draw the tiles.
- **Who may present:** the reviewing window says hosts only (20 Oct). So "Present slides" shows for
  whoever started as host; take-over by invitees only if the host allows it. That is Martin's call,
  your question 2.
- **`meetingInvitee(room)` for your rules:** I'll write it in firestore.rules and storage.rules, from
  the same list as meeting.html's own "for me" test (the event's teams and invitees, its team admins,
  master admins). It comes with the host work.
- **It waits for hosts:** meetingHostToken and "Start as host" come first (main; the plan is in
  design-mocks/mailings/PLAN.md). I'll write here when hosts work and the hook is in.

**VIDEO_BASE in places-admin.html (yours).** Every church's video rooms are moving to one setting,
`churchSettings/video`, read through a shared `egbc-video.js` (Church HQ's Daily account,
`<churchId>-<room>`). When it lands, please drop places-admin.html's own `egbc.daily.co` and room
list and read `EGBCVideo.rooms()`. I'll write the exact call here.

### F-248 — Your F-239 and F-241: done (the events window, 20 Oct)

**F-239: one answer for the switch, page and server.**
- **Server:** `functions/compliance.js` `featureOn()` now asks `functions/features.js` (`featureOn(db, 'buildingCompliance')`), so `peeps.js` follows. `functions/public-mail.js` uses it in place of its own.
- **Pages:** the four compliance pages (through `EGBCComplianceStore.gate()`) and the bookings dot ask `EGBCAuth.uses('buildingCompliance')`, after `EGBCAuth.reloadFeatures()`. None reads the document itself.
- **WAITING** in `tests/check-features-agree.mjs` is empty: 12/12.
- **Nothing stored now means ON** everywhere, as you set. My tests store `false` where they test "off". The gate test proves the pages treat "nothing stored" as on, and Stage 3 proves the daily run does too.

**F-241:**
1. **bookings-admin.html, day view:** the arrows are drawn (inline SVG, labelled "Day before" / "Day after"), not text arrows, and the time labels are 12px (`egbc-events-bookings.js`).
2. **"Checks due for me" for the app's Building home:**
   - **The call:** `EGBCComplianceStore.dueForMe(db, EGBCCompliance, memberId, { today, templates, all })` gives a Promise of `[{ id, title, siteId, siteName, due, rag, why, basisLabel }]`.
   - **The order:** overdue first, then due soon, then not recorded yet; `all: true` adds the in-date ones.
   - **It reads only what the rules let that person read.** Tested as Val in the browser: exactly her two checks.
3. **Numbering:** done (83adb717). F-243 is mine.

**Proved:**
- **The breaks, 3 of 3 caught:**
  - the pages wanting the switch stored as exactly true
  - the server wanting it stored as exactly true
  - `dueForMe` handing back a check not given to the person
- **Rule Zero, one test at a time:**

  | Test | Result |
  |---|---|
  | features-agree | 12 |
  | compliance stages 1–4, the gate | 57, 44, 31, 41, 17 |
  | c5 | 32, 45 |
  | r2, r3 | 50, 42 |
  | close-room | 27 |
  | public-mail | 45 |
  | audits: bookings-admin, compliance, building, risk, peep, room | 14, 14, 14, 14, 14, 27 |

### F-249 — Present for sessions: built, waiting for review (the events window, 20 Oct)

This is F-242's Part 2 for the session planner. The meeting side waits for the main window's hosts and invitees (F-247).

**What it is**
- **One engine:** `egbc-present.js`. The session page is `present.html?s=<session>`, and `&tv=1` gives the TV. meeting.html will use the same engine.
- **PowerPoint only. No PDF route anywhere.** In the planner, a leader adds a **PowerPoint** step: either the .pptx file or a OneDrive or SharePoint link. Keynote and Google Slides users are told to save it as PowerPoint first.
- **The converter** (`converter/`, Cloud Run, LibreOffice) makes every slide into a picture, plus a small preview picture. It reads the speaker notes and leaves out hidden slides, as PowerPoint does.
- **Sync:**
  - one small document per session (`presentNow/ps_<id>`) says which slide is showing
  - every screen fetches all the slides first, so a change of slide is a tiny message, even on weak Wi-Fi
  - on the emulator, Next reached the other phone and the TV in about 170 ms
- **The presenter view:**
  - the current slide, Up next, notes, a timer, Blank, Stop, and a filmstrip
  - keys and clickers work
  - a sticky control bar on a phone
  - a slot for the people (meeting tiles) is ready for meeting.html
- **Viewers:** "Browse on my own" and "Back to presenter". The TV shows a calm wait screen until someone presents.
- **Handing over:** another leader (or a master admin) can **Take over presenting**.
- **The guide:** "How to present" (`present-guide.html`) is two minutes long and is linked from the Present screen.
- **Keeping decks:** session decks are not swept. Meeting decks go 30 days after the meeting unless kept (`presentSweep`, daily).

**Who sees what (rules)**
- **A session's deck:** the group's leaders (and master admins) add it and present it. The group's team reads the slides. Nobody else does.
- **Speaker notes:** only the people who may present can read them, never the viewers. Only the converter writes them.
- **Meetings:** master admins only until the hosts and invitees are agreed (F-247).
- **Held until switch-over:** adding a deck waits until `launch.rulesLocked`, on the page and on the server. Until then Storage is not private.

**What Martin deploys at switch-over (I deploy nothing)**
1. **The functions** `presentConvert`, `presentFromLink` and `presentSweep`, with the rules, as usual.
2. **The converter.** The steps are at the top of `converter/server.mjs`: from inside `v2/converter`: `gcloud run deploy egbc-converter --source . --region europe-west2 --no-allow-unauthenticated --memory 2Gi --cpu 2 --timeout 300 --min-instances 0 --max-instances 2`. Then set `CONVERTER_URL` for the functions, and let the functions' service account invoke it.

**The running cost**
- **The converter** only runs while it converts, and costs nothing while idle (min-instances 0). A typical deck takes about 20 seconds on 2 CPUs: about 40 CPU-seconds, about 0.1p. The free allowance is about 180,000 CPU-seconds a month (about 4,000 decks), so a church's use is in practice **£0 a month**.
- **Storage:** about 5p a month.
- **Showing the slides:** each viewer fetches each picture once. Reads and writes are a handful per slide change, so they are lost in the free allowance.

**When the real LibreOffice is needed**
- **In the tests,** the converter is stood in for: a stand-in draws each slide in a browser, behind the same HTTP call. Everything around it is the real code: reading the .pptx (order, notes, hidden slides), storing the pictures and notes, the callable, the OneDrive fetch, and the rules.
- **What only the real LibreOffice proves** is how faithfully real slides come out: fonts, pictures, layout.
- **That needs one of these:**
  - (a) Martin deploys the converter and tries one real deck, or
  - (b) LibreOffice is installed on this PC so I can run `converter/convert.mjs` on a real deck locally.
- **The only Windows-specific part** is the `soffice` path. Say which you prefer.

### F-250 — Present: real PowerPoint decks through the real LibreOffice, and what was wrong (the events window, 20 Oct)

LibreOffice 26.8.1.1 is on this PC now. I put real decks through the converter's own path and compared every slide with **PowerPoint's own picture of it**. I exported those pictures from PowerPoint on this PC with `tools/pptx-reference.ps1`, which opens a copy read-only. The score is the share of each slide that clearly differs. No real deck or picture of one is in the repo.

**The decks I could reach**
- **The 729 MB Presentation1.pptx is not on this PC.** The only file of that name is 0.6 MB, from 2012. The "Presentation1" open in PowerPoint was the Strategy Day deck: 1.2 MB, never saved; I saved a copy without touching the open one.
- **OneDrive is not running,** so cloud-only files could not be opened. Where is the 729 MB file?

| Deck | Before the fix | After the fix |
|---|---|---|
| Worship Team Leaders Strategy Day (26 slides) | median 35.8% different; 23 slides over 8% | median **3.9%**; 8 over 8% (all Aptos, below) |
| Esher 26 (60 slides, made in Canva, 17 embedded fonts) | 29 slides over 8%; text overlapping | 23 over 8%; **no overlapping text**; the rest are small wrap differences, and PowerPoint itself gets some of these slides wrong |
| Worship & AV Team Training Day (7) | median 1.4% | unchanged: nothing to fix |

**Cause 1 — the lighthouse (Martin's screenshot).**
- Slide 1 uses the layout "Title, Photo 1". That layout's picture placeholder (`ph type="pic" idx="13"`) carries a sample picture as its fill, and the slide never uses that placeholder.
- PowerPoint never draws a layout's placeholders on a slide. LibreOffice drew the sample picture.
- **Fixed in the converter:** before LibreOffice, picture fills come off every placeholder in the layouts and masters. A slide's own pictures are untouched.
- "Hide background graphics" was already respected by LibreOffice. The test proves it.

**Cause 2 — overlapping text in Canva decks.**
- The slides ask for "Canva Sans Bold", "DM Sans Bold" and "Placard Next Wide Bold". The font embedded for each calls itself "Canva Sans" (and so on), weight bold.
- LibreOffice 26.8 does load embedded fonts, compressed ones too, but under the name the deck's font list gives. It found no "Canva Sans Bold" and used Arial Black, which is wider, so the text overlapped.
- **Fixed in the converter:** such text gets the font's own name, set bold, and the deck's font list is made to match: the "Bold" file becomes the bold face of "Canva Sans".
- Proof from the PDF: Arial Black gone; CanvaSans-Bold, DMSans-Bold, PlacardNext and RobotoCondensed-Bold used.

**Cause 3 — fonts the deck does not carry: Aptos.**
- Office's default font since 2023 is **Aptos**. PowerPoint downloads it from Microsoft and does not embed it, so LibreOffice substitutes. The title wraps differently ("Worship Team / Leaders Strategy Day"), and on slides 15 to 24 the substitute is heavy.
- **This cannot be fixed by tidying the file:** the converter needs the font itself.
- **Built:** the container has the free fonts made to Office's measurements (Carlito for Calibri, Liberation, Caladea, Noto). It also loads any font files put in Storage at `converter-fonts/`. Only the server reads there; the Storage rules close it to pages.
- **Decision for Martin:** may the church put Aptos there? Microsoft offers it as a free download, but whether it may be used on a server is a licence question, so it's his call, not mine.

**Also done**
- **Video and sound** in a deck are emptied before LibreOffice. The slides are pictures, and a big video no longer weighs on the converter.
- **The tidy-up never blocks a deck:** anything it cannot do, it leaves, and the original is rendered. What it did is kept on the deck (`prepared`).

**Videos and the 100 MB limit (decision)**
- Present shows a video slide as its picture, not playing. That's the same as any picture route.
- Uploads and OneDrive fetches stop at **100 MB** (Storage rule and `presentFromLink`), so a 729 MB deck is refused before conversion. Raising it to 1 GB needs the converter at `--memory 4Gi` (it holds the file while it converts).
- **Shall I raise it?** The rule goes live at switch-over like the rest.

**The fidelity check (committed):** `screenshots/events/present-fidelity.test.mjs`, 13/13.
- **The deck:** invented, built by PowerPoint itself (`fixtures/present-fidelity.pptx`): a layout with a sample picture, and slides with the background graphics hidden and shown. Beside it are PowerPoint's pictures of it (`present-fidelity-ppt-s1..3.png`).
- **Without LibreOffice** it tests the tidy-up itself: the sample picture off, the font renaming and font list on an invented embedded font, video emptied, every other part copied byte for byte.
- **With LibreOffice** it renders the converter's way and scores each slide against PowerPoint's: 1.3%, 3.7%, 3.8% (limit 6%). It also renders WITHOUT the tidy-up, which must fail: slide 1 is 34.4%.
- On a computer without LibreOffice that part says SKIPPED.
- **Breaks, 5 of 5 caught:**
  - sample pictures left on
  - the font list left
  - renamed text not set bold
  - every run made bold
  - video kept

**Can LibreOffice match PowerPoint?**
- For decks whose fonts are embedded, or are common, yes: within a few per cent, as above.
- For decks in **Aptos or other Office cloud fonts**, only if the converter is given the font. Without it the words are right but wrap and weigh differently.

**The Microsoft 365 route (planned, not built) — for churches with Microsoft 365, drawn by Microsoft:**
- **How:** Microsoft Graph converts a file to PDF with PowerPoint's own renderer (`GET /drives/{drive}/items/{item}/content?format=pdf`). Fonts, Aptos included, and layouts come out as PowerPoint draws them. The converter then makes pictures with pdftoppm exactly as now, and the notes are still read from the file.
- **Needs:**
  - a Microsoft 365 organisation (the nonprofit plans are free or cheap)
  - an app registration with `Sites.Selected` limited to one folder ("Present conversions"), consented by the church's Microsoft admin
  - its secret kept in Secret Manager
- **The flow:** upload the deck to that folder (an upload session for big files), ask for the PDF, delete the copy.
- **A OneDrive link** from the same organisation converts in place, with no upload.
- **Personal OneDrive** (a personal Microsoft account) cannot be used this way: that needs each presenter to sign in to Microsoft.
- **Choice and fallback:** a church setting picks "Microsoft" or "LibreOffice". If Microsoft fails or isn't set up, LibreOffice does it.
- **Cost:** none beyond the church's Microsoft licence. To check: Graph's size limit for conversion.
- **Question for Martin:** does EGBC have Microsoft 365 for the church (not personal)? If so, I can build this next to LibreOffice.

### F-251 — Present: video in the slides, in step everywhere; OneDrive links up to 1 GB (the events window, 20 Oct)

**The 729 MB deck**
- **Fetched** from its "Can view" link: the ChurchShow F-CS8b fourth link, Presentation1.pptx. It's **4 slides**, and slide 4 is a full-screen **7½-minute 1080p video** (692 MB, H.264 with AAC sound, plays on click).
- **Made into slides** with the tidy-up (video emptied first): **2.3 seconds**, and **0.2%** different from PowerPoint's own pictures.
- **A bug it exposed, fixed:** a church SharePoint "Can view" link sets a cookie on the first visit, and the download is **refused (403) without it**. Present's fetch kept no cookies, so church links would have failed. The converter now keeps them through the redirects.

**Links up to 1 GB (Martin's answer 2)**
- **The fetch moved** from the Cloud Function to the converter (`converter/fetch.mjs`): a function's memory cannot hold a 700 MB deck.
- **It streams straight into Storage:** 729 MB in 33 seconds, using **86 MB** of memory on this PC. It stops past 1 GB with a message saying so.
- **Uploads from a device stay at 100 MB.** Past that, the planner says: "This file is 250 MB. From this device the most is 100 MB. For a bigger one (often a video inside), put it in OneDrive, choose Share, 'Anyone with the link can view', and paste the link here: up to 1 GB."
- **The planner follows the deck's own status** ("Fetching it from OneDrive (729 MB)…", "Making the slides…", "Getting the video ready… a long video takes a few minutes") instead of waiting on the call, which times out first.
- **Deploy change (Martin):** the converter at `--memory 4Gi --timeout 900 --concurrency 1`, written in `converter/server.mjs`. The functions' timeouts are 900 s.

**Video in the slides (Martin's answer 3, built now)**
- **The converter takes each slide's video and sound out of the .pptx,** along with where it sits on the slide, on-click or by itself, loop and volume. These go to Storage beside the slide pictures (`present/<deck>/m<slide>-<n>.mp4`).
  - Browser-ready H.264 MP4, MP3 and M4A go as they are.
  - An MP4 whose index is at the end is rearranged so it streams.
  - HEVC (iPhone), WMV and AVI are made into H.264 (ffmpeg, in the container).
  - **A heavy video (over 5 Mbit/s) also gets a light 720p copy** (about 2.5 Mbit/s) for phones and weak Wi-Fi; the TV plays the full one.
- **Linked videos** (YouTube, OneDrive, Stream) stay links. YouTube plays in step through YouTube's own player; other links give the presenter "Open the video".
- **Present plays it over the slide picture, where PowerPoint puts it, in step on every screen.**
  - One small shared state says which video, playing or paused, from what second, since when.
  - Each screen works out where it should be and corrects itself if more than 1.5 s out.
  - **The presenter** has Play/Pause, Start again, and the K key.
  - **Viewers have no controls,** and a phone that skips ahead is put back.
  - **Someone joining late** starts at the right second.
  - **A video set to play by itself** starts when the slide comes. **A finished video stays finished.**
- **It streams:** the phone asks for the video in ranges, never downloading it first.
- **Sound:** on for the TV. If the TV's browser blocks sound, it shows "Click once to let this screen play sound". Off on phones and the presenter's screen, where "Sound off here" turns it on: a room of phones would echo.
- **Works on both routes,** because the video comes from the file, not from the drawing.
- **The rules:** `presentNow.media` is "playing" or "paused" with nothing else in it, and only the presenter changes it.

**Costs, per deck like the 729 MB one** (London region; Cloud Run tier-2 prices; Cloud Storage about 1.8p a GB a month and about 9.5p a GB to download, with no free download allowance in London)
- **Converting:** fetch, slides, storing the video, and making the light copy take about 4–6 minutes of 2 CPUs and 4 GB: about **2–3p**. The monthly free allowance (180,000 CPU-seconds) covers roughly 250 such decks, so in practice **£0**. A deck without a video: about 0.2p, also free.
- **Keeping it:** the source (729 MB), the video (692 MB) and the light copy (about 145 MB): about 1.6 GB, roughly **3p a month** while kept.
  - **Session decks are never swept today.** Shall the source file go 30 days after the session? It's only needed to convert again. That would halve the cost.
- **Playing it** is the cost that counts: every screen streams it.
  - **The TV**, full quality: about 692 MB, roughly **6.5p a play**.
  - **Each phone**, the light copy: about 145 MB, roughly **1.4p a play**.
  - **A session with a TV and 10 phones** watching the whole video: about **20p**.

**Tests**
- **present.test: 53/53.** Two new link checks, plus the video section (13 checks):
  - stored as it is
  - where it sits on all three screens
  - waits for a click
  - no controls for viewers
  - plays in step (within a second)
  - streamed in ranges
  - sound
  - a skip put back
  - a late joiner at the right second
  - pause on the same frame
  - start again
  - the rules
  - plays by itself
  - a finished video stays finished
- **Rules suite: 1641/1641** (5 new for the video state).
- **The invented 20-second clip** is made by Chrome (`fixtures/make-invented-clip.mjs`). No real video is in the repo.

### F-252 — Present: the Microsoft 365 route, for a church that connects its Microsoft 365 (the events window, 20 Oct)

**How it works** (`converter/microsoft.mjs`)
- **The converter signs in as an app** registered in the church's Microsoft 365, with no person signing in.
- **It puts the deck in one SharePoint folder** ("Present conversions"; a big deck goes up in 60 MB pieces), asks Microsoft Graph for a PDF (`?format=pdf`, drawn by PowerPoint's own renderer: Aptos, layouts, everything), and **deletes the copy**, always.
- **The pictures** are then made exactly as on the LibreOffice route. The notes and videos still come from the file.
- **If the route is not set up, or Microsoft fails or refuses, LibreOffice does it.** Each deck records which one made it (`renderer`) and why it fell back (`fallbackWhy`).
- **A PDF that kept a hidden slide** still has it left out.

**What Martin sets up, once** (a Microsoft 365 Global or SharePoint admin; about 15 minutes)
1. **Entra admin centre** (entra.microsoft.com) → App registrations → **New registration**:
   - name "EGBC Hub slides converter"
   - "Accounts in this organisational directory only"
   - no redirect address
2. **Note** its **Application (client) ID** and the **Directory (tenant) ID**.
3. **Certificates & secrets** → New client secret (24 months) → copy its **Value** once. Then:
   ```
   printf '%s' 'THE-VALUE' | gcloud secrets create egbc-ms-client-secret --data-file=- --project egbc-worship-planner
   ```
   Give the converter's service account "Secret Manager Secret Accessor" on it.
4. **API permissions** → Add → Microsoft Graph → **Application permissions** → **Sites.Selected** only → **Grant admin consent**. This alone lets the app into nothing.
5. **A SharePoint site for the conversions** (an existing church one will do, for example `https://esherchurch.sharepoint.com/sites/EGBCHub`). The converter creates the "Present conversions" folder itself.
6. **Give the app "write" on that one site.** In Graph Explorer, signed in as the admin:
   - `GET https://graph.microsoft.com/v1.0/sites/esherchurch.sharepoint.com:/sites/EGBCHub` (copy its `id`)
   - then `POST https://graph.microsoft.com/v1.0/sites/{id}/permissions` with
     `{"roles":["write"],"grantedToIdentities":[{"application":{"id":"<client id>","displayName":"EGBC Hub slides converter"}}]}`
   - or in PnP PowerShell: `Grant-PnPAzureADAppSitePermission -AppId <client id> -DisplayName "EGBC Hub slides converter" -Site <site url> -Permissions Write`
7. **Redeploy the converter** with:
   ```
   --set-env-vars MS_TENANT_ID=<tenant id>,MS_CLIENT_ID=<client id>,MS_SITE=esherchurch.sharepoint.com:/sites/EGBCHub
   --set-secrets MS_CLIENT_SECRET=egbc-ms-client-secret:latest
   ```
   (`converter/server.mjs` has it.)

**Cost:** none beyond the church's Microsoft 365 licence; Graph conversion is not charged. The copy is deleted at once, so it takes no SharePoint space.

**Tests:** `present-microsoft.test.mjs` runs the real route code against a stand-in for Microsoft on this PC:
- not set up → LibreOffice
- set up → Microsoft, with the app's own sign-in (client credentials, the `.default` scope, no person), the church's site, the folder, the PDF, and the copy deleted
- a hidden slide kept by the PDF → still 4 slides
- a big deck in pieces, byte for byte
- Microsoft failing (500) → LibreOffice, with the reason on the deck and the copy still deleted
- a wrong secret → LibreOffice, and "check MS_CLIENT_SECRET"
- the secret and token never stored with a deck

**Still to prove with the real thing:** that Graph's PDF of a real deck matches PowerPoint. That needs Martin's setup (steps 1–7); then `tools/pptx-reference.ps1` and the fidelity scoring compare the two. Microsoft's size limit for conversion is not documented; a refusal falls back to LibreOffice.

**Aptos (Martin's answer 4):** not on the server (licence). The LibreOffice route's `converter-fonts/` notes now say so.

### F-253 — Present: ONE Church HQ Microsoft 365 app, "Connect Microsoft 365"; the 30-day clear-out; the converter deploy; Present in the Menu (the events window, 21 Oct)

The reviewer's answers: one multi-tenant app instead of each church registering its own; a church's admin connects with a click; least privilege. This replaces F-252's per-church setup. F-252's route code is unchanged; only where it gets its settings is new.

**How a church connects** (`functions/microsoft.js`, `egbc-microsoft-connect.js`)
1. **A master admin opens Church settings → "Connect Microsoft 365"** (the card says they must be a Global administrator of the church's Microsoft 365).
2. **Microsoft's admin-consent screen** for "Church HQ slides" appears, and the admin approves it.
3. **One sign-in as that admin.** The hub uses it for one call: it gives the app **"write" on ONE site** (the church's root SharePoint site). It checks at once that the app's own token reaches that site, then **throws the sign-in away**.
4. **The hub keeps** `privateSettings/microsoft365` { tenant ID, site ID and address, domain, who and when }. There's no secret and no token in it, and no page can read it.
5. **The card says "Connected: <domain>".** "Disconnect" forgets it.
6. **Refused in words:** a declined consent; someone not an administrator; a start left over 15 minutes; a return that didn't start here.

**The permissions, and why (least privilege)**
- **Application `Sites.Selected`:** the app's only lasting right. It gives no site at all until a site is granted, then only that site. It's needed because conversion runs unattended (no one is signed in when a leader adds slides).
- **Delegated `Sites.FullControl.All`:** asked for only so the app can be granted its one site. Microsoft requires FullControl to grant `Sites.Selected` access, and an app with `Sites.Selected` cannot grant itself. It's used once, with the admin present, for that one call, and nothing keeps the token. The admin may revoke it afterwards (Entra → Enterprise applications → Church HQ slides → Permissions) and conversion carries on.
- **Not used:**
  - application `Files.ReadWrite.All` (every file in the church)
  - `Sites.ReadWrite.All` (every site)
  - a person's OneDrive app folder (it ties the hub to one person and needs a stored refresh token)
- **To prove with the real Microsoft:** that Microsoft accepts the site-permission grant with the admin's delegated token. Microsoft documents delegated `Sites.FullControl.All` for that call. If it refuses, the card shows the reason, and the fallback is one admin command, `Grant-PnPAzureADAppSitePermission`.

**Martin's one-off setup (Church HQ; about 15 minutes; then every church just clicks)**
1. **Entra admin centre** (entra.microsoft.com), in Church HQ's own Microsoft 365 → App registrations → **New registration**:
   - name **Church HQ slides**
   - Supported account types: **"Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)"**
   - Redirect URI, platform **Web**: `https://europe-west2-egbc-worship-planner.cloudfunctions.net/m365Callback`
2. **API permissions** → Add → Microsoft Graph:
   - **Application** → `Sites.Selected`
   - **Delegated** → `Sites.FullControl.All`

   No consent is needed in Church HQ's own tenant: each church consents for itself.
3. **Certificates & secrets** → New client secret (24 months; put a reminder in the calendar) → copy the **Value** once.
4. **Note the Application (client) ID.**
5. **Optional, recommended later:** publisher verification (Branding & properties). Without it, a church's admin sees "unverified" on the consent screen. It needs a Microsoft Partner Network ID.
6. **Give the hub the ID and the secret,** once, before the functions deploy:
   ```
   firebase functions:secrets:set MS_HQ_CLIENT_SECRET --project egbc-worship-planner
   ```
   (paste the secret's Value when asked), and in `v2/functions/.env.egbc-worship-planner`:
   ```
   MS_HQ_CLIENT_ID=<application (client) id>
   ```

**The converter deploy (the reviewer and Martin, after the quiz; exact)**
1. A service account for it, with only what it needs:
   ```
   gcloud iam service-accounts create egbc-converter --display-name "EGBC Present converter" --project egbc-worship-planner
   gcloud projects add-iam-policy-binding egbc-worship-planner --member serviceAccount:egbc-converter@egbc-worship-planner.iam.gserviceaccount.com --role roles/datastore.user
   gcloud projects add-iam-policy-binding egbc-worship-planner --member serviceAccount:egbc-converter@egbc-worship-planner.iam.gserviceaccount.com --role roles/storage.objectAdmin
   gcloud secrets add-iam-policy-binding MS_HQ_CLIENT_SECRET --member serviceAccount:egbc-converter@egbc-worship-planner.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor --project egbc-worship-planner
   ```
2. Deploy, from `v2/converter`:
   ```
   gcloud run deploy egbc-converter --source . --region europe-west2 --project egbc-worship-planner \
     --service-account egbc-converter@egbc-worship-planner.iam.gserviceaccount.com \
     --no-allow-unauthenticated --memory 4Gi --cpu 2 --timeout 900 --concurrency 1 \
     --min-instances 0 --max-instances 2 \
     --set-env-vars BUCKET=egbc-worship-planner.firebasestorage.app,MS_CLIENT_ID=<application (client) id> \
     --set-secrets MS_CLIENT_SECRET=MS_HQ_CLIENT_SECRET:latest
   ```
   The Dockerfile brings LibreOffice, poppler, ffmpeg and the fonts.
3. Let the hub's functions call it, and tell them where it is. The invoker is the functions' account, `<project number>-compute@developer.gserviceaccount.com`; the project number comes from `gcloud projects describe egbc-worship-planner --format "value(projectNumber)"`:
   ```
   gcloud run services add-iam-policy-binding egbc-converter --region europe-west2 --project egbc-worship-planner --member serviceAccount:<project number>-compute@developer.gserviceaccount.com --role roles/run.invoker
   ```
   Then in `v2/functions/.env.egbc-worship-planner`:
   ```
   CONVERTER_URL=<the service URL the deploy printed>
   ```
4. **Then the functions deploy as usual** (Martin): presentConvert, presentFromLink, presentSweep, m365Start, m365Callback, m365Status and m365Disconnect.
5. **For the real test:**
   - one deck by upload
   - the 729 MB link
   - Connect Microsoft 365 at EGBC, then a deck, and check that its `renderer` says "microsoft"
   - compare with `tools/pptx-reference.ps1`

**The clear-out (the reviewer's answer 2):** `presentSweep` (daily) now deletes a session deck's **PowerPoint file 30 days after the session**. The deck keeps its slide pictures and its extracted video, so it can still be shown. Asking to make the slides again then says the file was cleared and to add it again. A session less than 30 days ago keeps its file.

**Present in the Menu (main's check-menu: 2 reds)**
- `egbc-menu.js` has **Present** and **How to present** after Session planner, behind `sessionPlanner`, for the same people (`planGroup`).
- Opened from the Menu, present.html now lists the person's groups' coming sessions, next first, each to open.
- **For the main window:**
  - I added the two names to `tests/check-menu.mjs` APPROVED (after Session planner, `c => c.plans`). That's the only change in tests/, as the reviewer asked for the entries.
  - Please bump the egbc-menu stamp if your check-stamps wants it.
  - **I could not run check-menu** (it is wired to your emulator, 8181/9099). Its static page check, run on its own: Present and How to present are in; the one page still with no way in is `enews-edit.html`, which is not mine.

**For the main window (Church settings is yours): please add the card**, for master admins:
```
<div id="m365"></div>
<script src="egbc-microsoft-connect.js?v=<stamp>"></script>
<script>EGBCMicrosoft.mount(document.getElementById('m365'));</script>
```
Microsoft sends the admin back to `church-settings.html?m365=connected|failed&why=...#m365`; the card reads that and shows how it went.

**Tests**
- **present-microsoft: 35/35.** Connect, declined, not an admin, forged, stale, master-only, saved without secrets, the card, the next deck drawn by Microsoft through the connection, disconnect, the clear-out.
- **present: 55/55**, with the Menu chooser.
- **Audit of the Present pages: 40/40.** Fidelity: 13/13.
- **Breaks, 6 of 6 caught:**
  - a stale start accepted (got through at first; the expiry check was added)
  - anyone may start Connect
  - the admin's token kept
  - the converter ignoring the connection
  - the clear-out deleting the pictures and video
  - the clear-out ignoring the date

### F-254 — Church HQ's own Microsoft tenant (setup from the start); a plain screen before Microsoft (the events window, 21 Oct)

This **replaces F-253's "Martin's one-off setup" section.** The Church HQ app lives in a **Church HQ-owned Microsoft tenant, never EGBC's**. EGBC connects like any other church.

**Before Microsoft, a plain screen.** "Connect Microsoft 365" now first shows "Before you go to Microsoft":
- **Screen 1:** "Church HQ slides" asks for permission. Afterwards it can use one SharePoint site, only to draw slides; a copy of each PowerPoint is there for a moment, then deleted; it cannot see email, other files or other sites.
- **Screen 2:** a second sign-in lists "Have full control of all site collections" (Sites.FullControl.All). It's needed for one step only (giving the app its one site, which an app cannot do for itself), used once, kept by nothing (the hub never stores the sign-in), and removable afterwards in Entra without breaking slides.
- **Then:** "Continue to Microsoft" or "Not now". "Not now" starts nothing.
- **Tested:** present-microsoft, 37/37. Break: going straight to Microsoft is caught.
- Screenshot: `screenshots/events/present-real-m365-before.png`.

**Martin's setup, from nothing (with the reviewer, after the quiz; about 30 minutes; free)**

*A. A home for Church HQ in Microsoft (the tenant)*
1. **Make a Microsoft account for Church HQ only**, never an EGBC address, for example `churchhq.setup@outlook.com` at signup.live.com. Give it a strong password and two-step verification. It owns the tenant, and is kept as the spare way in.
2. **Create the tenant.** Go to **entra.microsoft.com** and sign in with that account. Then **Entra ID → Overview → Manage tenants → + Create → Microsoft Entra ID → Next**:
   - Organisation name: **Church HQ**
   - Initial domain: **churchhq** (it becomes `churchhq.onmicrosoft.com`; if taken, `churchhqslides`)
   - Country: **United Kingdom**

   Then **Review + create**, answer the check, and **Create**. It takes a few minutes, and Microsoft Entra ID Free costs nothing.
   - **If it says a subscription is needed:** at **portal.azure.com**, with the same account, take the **Azure free account** (it asks for a card to check identity; nothing is charged unless you upgrade). Then **Microsoft Entra ID → Manage tenants → + Create**, with the same answers.
3. **Switch into the new tenant:** top right, **Switch tenant → Church HQ**.
4. **Make Church HQ's own administrator:** **Users → New user → Create new user**:
   - `admin@churchhq.onmicrosoft.com`, display name "Church HQ admin", auto-generated password
   - **Assignments: Global Administrator**

   Sign out and sign in as that user. Change the password, and set up **Microsoft Authenticator**; new tenants require it (security defaults). Use this account from now on; the outlook.com one stays as the spare.

*B. The app, in the Church HQ tenant (signed in as admin@churchhq.onmicrosoft.com)*

5. **App registrations → New registration:**
   - Name **Church HQ slides**
   - Supported account types **"Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)"**
   - Redirect URI: platform **Web**, `https://europe-west2-egbc-worship-planner.cloudfunctions.net/m365Callback`
6. **API permissions → Add a permission → Microsoft Graph:**
   - **Application permissions → Sites.Selected**
   - **Delegated permissions → Sites.FullControl.All**

   **Do not** grant admin consent here: each church consents for itself when it connects.
7. **Branding & properties:** the name "Church HQ slides", and optionally a logo and a home page. The publisher shows as `churchhq.onmicrosoft.com`. "Verified publisher" (no "unverified" warning for churches) can come later; it needs a Microsoft AI Cloud Partner Program account.
8. **Certificates & secrets → New client secret:** description "converter", **24 months**. **Copy the Value at once**; it's shown once. Put a calendar reminder at 23 months to make a new one.
9. **Overview:** note the **Application (client) ID**. Keep the **Directory (tenant) ID** for the record; the hub doesn't need it.

*C. Give the hub the app (once, before the functions deploy)*

10. ```
    firebase functions:secrets:set MS_HQ_CLIENT_SECRET --project egbc-worship-planner
    ```
    Paste the Value when it asks. Then, in `v2/functions/.env.egbc-worship-planner`:
    ```
    MS_HQ_CLIENT_ID=<application (client) id>
    ```
11. **The converter deploy:** as in F-253 (the service account, `gcloud run deploy` with `MS_CLIENT_ID=<application (client) id>` and `--set-secrets MS_CLIENT_SECRET=MS_HQ_CLIENT_SECRET:latest`, the invoker, `CONVERTER_URL`).

*D. EGBC connects, like any church*

12. **EGBC's own Global administrator** (in EGBC's Microsoft 365, not Church HQ's) opens Church settings → **Connect Microsoft 365** → reads the plain screen → approves "Church HQ slides" → signs in once more → back to "Connected: esherchurch.sharepoint.com".
13. **Real test:**
    - a deck, whose `renderer` should say "microsoft"
    - the 729 MB link
    - a comparison with `tools/pptx-reference.ps1`
    - **Afterwards, optional:** in EGBC's Entra → Enterprise applications → Church HQ slides → Permissions, remove the delegated Sites.FullControl.All. Slides keep working.

*E. Later: another church's hub*

14. Add that hub's callback address (`https://europe-west2-<its project>.cloudfunctions.net/m365Callback`) to the same app: **Authentication → Add URI**. Nothing else changes; the app is one for all.

### F-255 — The quiz (session planner, Part 3): PLAN and mock-ups — for review before building (the events window, 21 Oct)

**What exists already:** the planner's quiz step (F-223) stores up to 12 questions, each with four answers (the right one written first) and 20 seconds. This builds the playing of it, inside Present, so a quiz sits between slides and verses in the same flow.

**Mock-ups** (`v2/screenshots/events/`):

| Mock-up | What it shows |
|---|---|
| `quiz-mock-choose-desk.png` | the presenter reaches the quiz: "Teams on the TV" or "Everyone on their phones" |
| `quiz-mock-tv-question.png` | TV mode: the question, A–D, the timer, the team scores |
| `quiz-mock-leader-teams-375.png` | TV mode, the leader's phone: the right answer marked, "Show the answer on the TV", tap each team that got it, Next |
| `quiz-mock-tv-join.png` | phones mode, the TV: the join code and who's here |
| `quiz-mock-phone-join-375.png` | a player: the code and a nickname, no account |
| `quiz-mock-phone-answer-375.png` | a player: four whole-width buttons and the timer |
| `quiz-mock-phone-result-375.png` | a player: right/wrong, points, place |
| `quiz-mock-tv-leaderboard.png` | phones mode, the TV: how many chose each answer, the top five |
| `quiz-mock-leader-phones-375.png` | phones mode, the leader: answered 9 of 11, show the answer now, remove a name, end and delete |

The look is our own: lettered answers in the church's colours, not another game's shapes.

**1. Choosing.** On reaching a quiz step, the presenter picks the mode. Nothing starts until they do. The answer order is mixed by a seed in the shared state, so every screen shows the same order.

**2. TV mode (younger groups, no phones)**
- **The TV shows** the question, A–D, a countdown, and the teams with their scores along the bottom.
- **The leader's phone shows** the right answer marked. "Show the answer on the TV" highlights it. Then the leader taps each team that got it right (1 point each), and Next.
- **Teams:** 2 to 6, named and coloured at the start (defaults Lions, Eagles, Bears), with their scores shown at the end.
- **The data** is all in the existing `presentNow` doc, as a `quiz` field: which step, which question, the phase (question, answer, scores, end), the teams and scores, the seed, and when it opened. Only the presenter writes it, as with the slides and the video (the rules), and every screen follows as it does now. **No new collection; nothing to delete.**

**3. Phones mode (older groups)**
- **Joining:** the TV shows a 6-digit code, a QR code and the hub's quiz address. A player opens `quiz.html` (public, no account), types the code and a first name or nickname (up to 20 characters; obvious rude words refused), and is in.
- **Answering:**
  - The question's text and the mixed answers go on a quiz-run document when the question opens. **The right answer is never there until the leader shows it.**
  - A phone answers once per question, within the time.
  - Points: 500 for right, plus up to 500 for speed, timed by the server from when the question opened.
- **After each question:** the TV shows how many chose each answer, then the top five. Each phone shows right or wrong, its points and its place.
- **The leader** sees "answered 9 of 11", can show the answer early, and can **remove a name**: that phone is told to join again with another name, and its key stops working.
- **Nothing is kept:**
  - "End the quiz" deletes the run, its players and its answers at once.
  - An hourly sweep deletes any run older than 24 hours.
  - Nothing but a nickname is ever asked for.

**4. The one decision: how phones join (this is the "anonymous sign-in" question)**
- **(a) Recommended: no sign-in at all; the functions do the work.**
  - `quizJoin(code, nickname)` returns the run and a private player key. The key is kept on the phone for that quiz only.
  - `quizAnswer(run, key, question, choice)` records the answer. The server keeps the times, so the timing is fair.
  - **Phones read** one document per run, by its unguessable ID: the current question, the counts after the reveal, and the leaderboard of nicknames and scores. **They can read nothing else.**
  - **The presenter's own functions** (`quizOpen`, `quizReveal`, `quizKick`, `quizEnd`) check that they may present.
  - **Why recommended:** it needs **no change to Firebase Auth** and **no rules audit**.
- **(b) Firebase anonymous sign-in.** It works too, but switching it on makes every visitor a "signed-in user". Every rule that only checks "signed in", in firestore.rules and storage.rules (the storage suite itself has "a signed-in member can still upload a banner"), would then let a throwaway visitor through. All of them would need `sign_in_provider != 'anonymous'` first. That's the main window's rules as well as mine, a big audit for little gain.
- **So:** with (a), **anonymous sign-in is never needed.** If you or Martin prefer (b), I'll list every rule that would need the guard before anything is switched on, and say when to switch it on (not before that audit has landed).

**5. Built in, as Present**
- one engine, the same on the TV, the leader's phone and the players' phones
- works on weak Wi-Fi (one small document per run; nothing is downloaded during a question)
- 375 px and keys (A–D, or 1–4, to answer on a computer)
- the plain-English "How to run a quiz" added to the Present guide

**6. Tests and breaks, planned**
- **Tests:**
  - TV mode: the TV follows, team scores add up, and only the presenter changes anything
  - phones mode: join with code and nickname; a rude word refused; one answer per question; a late answer refused; points by speed
  - **the right answer cannot be read from a phone before the reveal**
  - a removed name's key stops working
  - "End" deletes everything; the 24-hour sweep deletes a forgotten run
  - nobody outside reads another run
  - screenshots of the real thing at 1280×720 and 375 px
- **Breaks:**
  - the right answer readable early
  - a second answer accepted
  - a late answer accepted
  - a removed key still works
  - End leaving data behind
  - the sweep ignoring old runs
  - a viewer able to move the quiz on

**7. Questions for Martin and the reviewer**
1. Phones joining: **(a) functions, no sign-in** (recommended), or (b) anonymous sign-in plus a rules audit?
2. The quiz address on the TV: the hub's long address plus a QR code (no new domain), or a short link?
3. TV mode scoring: 1 point a team per right answer (simple), or more for the first team to shout?
4. Leaving the feature switch as `quiz` (F-223, off for a church until turned on): yes?

### F-256 — The quiz, built (F-255; the reviewer's answers of 21 Oct) — stopped for review (the events window)

**What was built**
- **In Present** (`egbc-quiz.js`, `egbc-present.js`, `present.html`): a session's Quiz step is one item. The presenter chooses **Teams on the TV** or **Everyone on their phones**. On a computer the leader's controls sit beside the slide; on a phone they come first.
- **TV mode:**
  - the question, A–D in a mixed order (the same on every screen), a countdown and the teams' scores
  - the leader's screen marks the right answer, then "Show the answer on the TV", then taps each team that got it
  - **1 point a team; an optional bonus point for the first team** (the leader ticks it at the start)
  - "Show the scores", and the final scores
  - it lives in `presentNow.quiz`, so it needs nothing stored and nothing deleted; only the presenter changes it (the rules)
- **Phones mode** (`functions/quiz.js`, `quiz.html`): **anonymous sign-in stays OFF.**
  - **Joining:** a 6-digit code, **a QR code and churchhq.co.uk/quiz** on the TV. A player opens `quiz.html` (no account), types a first name or nickname (rude ones refused; a taken one numbered "Sam 2") and gets a private player key.
  - **Answering:** the question on the phones in the TV's order. One answer each, none late; the server keeps the time. 500 points for right, plus up to 500 for speed.
  - **After each question:** Right/Not this time, points and place on the phone; how many chose each answer, then the top five, on the TV.
  - **The leader** sees "2 of 3 answered", can show the answer early, and can **remove a name**: that phone is told to join again with another name, and its key stops working.
  - **The right answer is never readable from a phone** before it's shown: the quiz's public document holds no answer, and the answers, keys, codes and right answers have no rule at all.
  - **Nothing kept:** "End the quiz" deletes the run, its code, every key and every answer. **The hourly sweep** deletes any run older than 24 hours.
  - **Held until switch-over,** as the rest of Present; TV mode works now.
- **The switch:** quiz steps show only when `quiz` is on (page and server). The Present guide has a short "A quiz" step.

**The short address (the reviewer and Martin, on Cloudflare)**
- **churchhq.co.uk** must be on Cloudflare with a **proxied** DNS record (orange cloud). If it has no website yet: `AAAA @ 100::`, proxied.
- **Rules → Redirect Rules → Create rule:**
  - When: Hostname **equals** `churchhq.co.uk` **and** URI Path **starts with** `/quiz`
  - Then: **Static** redirect to `https://esherchurch.github.io/availability-form/v2/quiz.html`, status **302**, **Preserve query string: ON**
  - (Add the same for `www.churchhq.co.uk` if it is used.)
- **What happens:** the TV's QR code is `https://churchhq.co.uk/quiz?c=<code>`, which lands on `quiz.html?c=<code>` with the code filled in. Typing just "churchhq.co.uk/quiz" lands on the same page, which asks for the code.
- **"The code finds the church's quiz":** today there is one hub, so the redirect goes to EGBC's. With more than one church, the codes must be unique across churches and the address must ask Church HQ which hub has that code (a small lookup). I haven't built that; it's noted for when a second church comes.

**For the main window**
1. **The `quiz` switch:** please add `{ name: 'quiz', label: 'Quiz', on: true, addOn: true }` to FEATURES in `egbc-auth.js` and to `functions/features.js`. That's on at EGBC and off by default for a new church, as the reviewer set. Until then a name not listed counts as on, so EGBC works today; check-features-agree should then pass with it in both.
2. **check-menu:** `quiz.html` is a new public page. I added it to `REACHED_ELSEWHERE` in `tests/check-menu.mjs` ("public: the quiz on a player's phone, from the TV's QR code and churchhq.co.uk/quiz"). That's my only change in tests/.

**Tests**
- **present-quiz: 38/38**, with screenshots of the real thing (`quiz-real-*.png`):
  - TV mode: TV question; leader at desk and at 375 px
  - phones mode: TV join with the QR code; phone joining, answering and result; TV leaderboard; leader removing a name at desk and 375 px; leader's phones view
- **present-quiz: 39/39**, with the switch check: quiz off, the server will not start one.
- **Rules suite: 1679/1679.**
  - TV mode: the presenter only, no more than 6 teams, nothing extra.
  - Phones mode: a run is read by id with no account; nobody lists runs; nobody writes from a page.
  - The right answers, answers, keys and codes: no page, not even a master admin's.
- **Audits:** Present pages 40/40, quiz.html 14/14. **check-stamps:** 6/6.
- **Breaks, 11 of 11 caught:**
  - the right answer on the phones before it is shown
  - a second answer accepted
  - a late answer accepted
  - a removed key still working
  - End leaving the answers
  - the sweep ignoring old runs
  - a team member changing the TV quiz
  - anyone running a phones quiz
  - the leader's order differing from the TV's
  - no bonus
  - rude names let through
- **No new secret:** the quiz declares no `defineSecret` and no `defineString`.

**"NOT-SET" means not set up (the reviewer, 21 Oct)**
- `MS_HQ_CLIENT_SECRET=NOT-SET` and `MS_HQ_CLIENT_ID=NOT-SET` (or empty) count as "Microsoft 365 isn't set up yet":
  - `m365Start` answers "Microsoft 365 isn't set up yet: Church HQ hasn't finished setting up its app. Until then Present draws PowerPoint slides itself."
  - The card says "Not available yet", with no Connect button.
  - The converter treats `NOT-SET` in `MS_CLIENT_ID`/`MS_CLIENT_SECRET` as no app and uses LibreOffice, even with a saved connection.
- **Checked:** present-microsoft, 42/42. Break: `NOT-SET` taken as real is caught.
- **The client ID's home:** `functions/.env.egbc-worship-planner` is right for the real ID (it isn't a secret, and the functions read it there). Committing it then is fine.
- **From now on I tell you before adding any `defineSecret`** (or `defineString`), so it exists before the next deploy.

## From the main window, 21 Oct 2026: check-menu on present.html and present-guide.html

The full check-menu (dev emulator) is 95/96. Its one red is yours: **present.html and present-guide.html load no egbc-shell.js, and NO_MENU in tests/check-menu.mjs gives no reason.**

- **present.html:** full-screen slides, so no bar seems right. If so, please add it to NO_MENU with the reason.
- **present-guide.html:** it is a Menu entry, but the page has no Menu and only "← Back" (history.back(), which goes nowhere when it is opened in a new tab). Either give it the shell, or add it to NO_MENU with the reason.

I haven't changed either page.

### F-257 — Deploy day: the converter and Microsoft 365, step by step (for the reviewer and Martin) (the events window, 21 Oct)

This **brings F-253 and F-254 together, in order**, for Church HQ's real tenant (Martin's free Azure sign-up as **hello@churchhq.co.uk**). It takes about an hour. Nothing here touches the rules: they go live at switch-over, as before.

**Why the converter is proved with a tool, not through Present:** Present will not make slides before switch-over (the live Storage is not private yet). So `tools/converter-smoke.mjs` sends an **invented** deck, or a share link, straight to the deployed converter, checks the result, and deletes everything it made. It's a dry run unless given `--live --write`. I ran it end to end here: the emulators, a local converter and the real LibreOffice gave 3 slides in 5.9 s, the layout sample picture was taken off, and nothing was left.

---

**A. Church HQ's tenant and app (Martin, in a browser, about 20 minutes)**
1. **Find the tenant.** Sign in at **entra.microsoft.com** as hello@churchhq.co.uk. The free Azure sign-up made a directory (usually called "Default Directory"). On **Overview**, note its **Primary domain** (something like `hellochurchhqco.onmicrosoft.com`) and its **Tenant ID**. Write both here for the record: the domain's name is the "actual tenant name" the reviewer asked for.
2. **Name it:** Overview → **Properties** → Name: **Church HQ** → Save.
3. **Church HQ's own administrator** (so the app isn't tied to the sign-up account): **Users → New user → Create new user**:
   - `admin@<primary domain>`, display name "Church HQ admin"
   - **Assignments: Global Administrator**

   Sign in as it, change the password, and set up Microsoft Authenticator. hello@churchhq.co.uk stays as the spare way in.
4. **Optional, nicer for churches:** **Domain names → Add custom domain → churchhq.co.uk**, then put the TXT record it shows into churchhq.co.uk's DNS, and Verify. The app's publisher then shows churchhq.co.uk instead of the onmicrosoft.com name.
5. **The app, as Church HQ admin:** **App registrations → New registration:**
   - Name **Church HQ slides**
   - **"Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)"**
   - Redirect URI, platform **Web**: `https://europe-west2-egbc-worship-planner.cloudfunctions.net/m365Callback`
6. **API permissions → Add a permission → Microsoft Graph:**
   - **Application → Sites.Selected**
   - **Delegated → Sites.FullControl.All**

   Do **not** grant consent here.
7. **Certificates & secrets → New client secret:** "converter", **24 months**. Copy the **Value** now (shown once). Put a calendar reminder at 23 months.
8. **Overview:** copy the **Application (client) ID**.

**B. Give the hub the app (the reviewer)**

9. The secret, replacing the placeholder:
   ```
   firebase functions:secrets:set MS_HQ_CLIENT_SECRET --project egbc-worship-planner
   ```
   Paste the Value.
10. The client ID (not a secret): in `v2/functions/.env.egbc-worship-planner`, set `MS_HQ_CLIENT_ID=<application (client) id>` (instead of NOT-SET), and commit that file.

**C. The converter (the reviewer, with Martin signed in to gcloud for the Cloud Run deploy)**

11. Its service account, with only what it needs:
    ```
    gcloud iam service-accounts create egbc-converter --display-name "EGBC Present converter" --project egbc-worship-planner
    gcloud projects add-iam-policy-binding egbc-worship-planner --member serviceAccount:egbc-converter@egbc-worship-planner.iam.gserviceaccount.com --role roles/datastore.user
    gcloud projects add-iam-policy-binding egbc-worship-planner --member serviceAccount:egbc-converter@egbc-worship-planner.iam.gserviceaccount.com --role roles/storage.objectAdmin
    gcloud secrets add-iam-policy-binding MS_HQ_CLIENT_SECRET --member serviceAccount:egbc-converter@egbc-worship-planner.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor --project egbc-worship-planner
    ```
12. Deploy, from `v2/converter`:
    ```
    gcloud run deploy egbc-converter --source . --region europe-west2 --project egbc-worship-planner \
      --service-account egbc-converter@egbc-worship-planner.iam.gserviceaccount.com \
      --no-allow-unauthenticated --memory 4Gi --cpu 2 --timeout 900 --concurrency 1 \
      --min-instances 0 --max-instances 2 \
      --set-env-vars BUCKET=egbc-worship-planner.firebasestorage.app,MS_CLIENT_ID=<application (client) id> \
      --set-secrets MS_CLIENT_SECRET=MS_HQ_CLIENT_SECRET:latest
    ```
    The first build takes about 10 minutes (LibreOffice, poppler, ffmpeg, fonts). Note the service URL it prints.
13. Let the hub's functions call it. The project number comes from `gcloud projects describe egbc-worship-planner --format "value(projectNumber)"`.
    ```
    gcloud run services add-iam-policy-binding egbc-converter --region europe-west2 --project egbc-worship-planner --member serviceAccount:<project number>-compute@developer.gserviceaccount.com --role roles/run.invoker
    ```
    Let yourself call it too, for the smoke test:
    ```
    gcloud run services add-iam-policy-binding egbc-converter --region europe-west2 --project egbc-worship-planner --member user:<your google account> --role roles/run.invoker
    ```
14. Tell the functions where it is: add `CONVERTER_URL=<the service URL>` to `v2/functions/.env.egbc-worship-planner`.

**D. The functions (the reviewer)**

15. Deploy `presentConvert`, `presentFromLink`, `presentSweep`, `m365Start`, `m365Callback`, `m365Status` and `m365Disconnect`. The two m365 functions already deployed need it again, to pick up the real secret and ID.

**E. Proving it (the reviewer, with the tool; it writes only its own smoke-* records and deletes them)**

16. `node tools/converter-smoke.mjs` (a dry run: it should find the converter).
17. `node tools/converter-smoke.mjs --live --write --compare`
    - **Expect:** 3 slides; renderer libreoffice; "layout sample pictures taken off: 1"; fidelity **under 6** on each slide (the real pdftoppm now, against PowerPoint's own pictures in the repo); "Cleaned up: nothing left".
18. `node tools/converter-smoke.mjs --live --write --link "<the 729 MB deck's Can-view link, ChurchShow F-CS8b>"`
    - **Expect:** "fetching 729 MB", then 4 slides; media on slide 4: a video of 450 s, on click, with a light copy; about 4–6 minutes.
19. **Connect EGBC's Microsoft 365.** EGBC's own Global administrator (in EGBC's Microsoft 365, **not** hello@churchhq.co.uk): Church settings → **Connect Microsoft 365** → read the plain screen → Continue → approve "Church HQ slides" → sign in once more → back to **"Connected: esherchurch.sharepoint.com"**.
20. `node tools/converter-smoke.mjs --live --write --compare` again.
    - **Expect: renderer microsoft**, and fidelity close to 0 (Microsoft draws it as PowerPoint does).
    - **If it says libreoffice,** `fallbackWhy` says why. The likely ones: the grant not yet active (wait a minute, try again), or the secret/ID not picked up (step 15).
21. **Optional:** in EGBC's Entra → Enterprise applications → Church HQ slides → Permissions, remove the delegated **Sites.FullControl.All**. Run step 20 again: still microsoft.

**F. If something goes wrong**
- **The converter's log:**
  ```
  gcloud run services logs read egbc-converter --region europe-west2 --project egbc-worship-planner --limit 50
  ```
- **Microsoft failing never stops slides:** LibreOffice takes over, and the deck says why.
- **To stop using Microsoft:** Disconnect on the card, or set the secret back to NOT-SET and redeploy.
- **A kept smoke run:** delete it with `node tools/converter-smoke.mjs --live --write --delete smoke-<time>`.

**Costs** (as in F-251)
- **The converter** costs nothing while idle. A deck is about 0.2p, or about 2–3p with a long video, within the free allowance.
- **Storage:** about 1.8p a GB a month.
- **Streaming a video:** about 9.5p a GB.
- **Microsoft:** nothing beyond EGBC's licence.

**After switch-over:** the real test in Present itself (a deck by upload, the 729 MB link in the planner, presenting with the video) uses the same converter. Nothing more to deploy then except the rules, which go live with switch-over.

## From the main window, 21 Oct 2026: the emulator stops and asks for MS_HQ_CLIENT_ID

`emulators:start` now stops at **"Enter a string value for MS_HQ_CLIENT_ID"** (microsoft.js `defineString`). Nothing unattended can start the functions emulator: the checks, the audit and background runs all sit there. The `default: ''` doesn't stop the prompt, because no .env file gives a value.

- **What I did, locally only:** added `functions/.env.local` (gitignored, emulator only) with `MS_HQ_CLIENT_ID=NOT-SET`.
- **Please make it work from a fresh clone.** Either commit `functions/.env.egbc-worship-planner` with `MS_HQ_CLIENT_ID=NOT-SET` now (your F-254 step 10 says it lives there), or say how you want it done.

### F-258 — After deploy day: why no light copy was made (fixed), a check for undeclared secrets, puppeteer-core (the events window, 21 Oct)

**1. No light copy for the 729 MB deck's video: found and fixed** (`converter/convert.mjs`)
- **The cause:** the light copy's filter was written `'scale=-2:min(720\,ih)'` in JavaScript. There `\,` is just a comma, so ffmpeg received `scale=-2:min(720,ih)`. In an ffmpeg filter a comma starts the next filter, so ffmpeg refused it at once.
- **Why nobody saw it:** the step's `catch` swallowed the error. No light copy, and nothing in the converter's log.
- **ffmpeg itself was fine:** it's in the image, and the step did run.
- **Fixed:**
  - the filter is now `LIGHT_FILTER = 'scale=-2:min(720\\,ih)'`, so ffmpeg gets the backslash
  - **ffmpeg failing is never silent again:** the deck's media entry records ffmpeg's own last words (`lightWhy`, and `ffWhy` for "make playable"), and the converter logs them ("ffmpeg (light copy) <deck> <video>: …")
- **The check:** `screenshots/events/present-media.test.mjs` (plain Node, 8/8). It uses a stand-in Storage and a **stand-in ffmpeg as strict as the real one about filters** (a comma without a backslash starts another filter):
  - a heavy video gets its light copy
  - the full video is stored untouched
  - a failing ffmpeg is recorded and logged
  - a light video gets no copy
  - HEVC is made into H.264
- **Breaks, 2 of 2 caught:** the deploy-day filter (no light copy, as live); the error swallowed again.
- **What to redeploy: the converter only.** The same `gcloud run deploy` line as F-257 step 12, from `v2/converter`, with Martin signed in to gcloud. No function changed.
- **Then, to prove it:**
  ```
  node tools/converter-smoke.mjs --live --write --link "<the 729 MB link>"
  ```
  - **Expect:** media on slide 4 with `+ light m4-0-light.mp4`, and files listing `m4-0-light.mp4` at roughly 140 MB.
  - **Time:** it takes about 4–7 minutes longer, while ffmpeg makes the 720p copy of the 7½-minute video (well inside the 900 s limit).
  - **If ffmpeg still refuses for any reason,** the smoke output's media line and the log now say why.

**2. A check that would have caught m365Status (a4fe8d92):** `screenshots/events/functions-secrets.test.mjs` (5/5).
- **What it reads:** my functions' own source (microsoft.js, present.js, quiz.js).
- **What it checks:** every exported trigger that reads a `defineSecret`, directly or through a helper such as `settings()`, must declare it in `secrets: [...]`.
- **It bites:** m365Status as it was before a4fe8d92 is caught. It sees m365Start, m365Callback and m365Status needing MS_HQ_CLIENT_SECRET.
- **Why a code check:** on the emulator the secret is never read, so no browser test could catch this.

**3. The smoke tool in a fresh checkout:** `puppeteer-core` (25.12.0, what was already in use) is now in v2's `package.json` devDependencies, with the lock file. `npm install` in `v2/` brings it.

**Also:** Church settings now mounts the Connect card (main window), which tidies `?m365=` out of the address bar. present-microsoft now records where Microsoft sent the admin back to, instead of reading the final address: 42/42.

**Step 19 waits** for EGBC's Microsoft 365 administrator, as the reviewer says. When they've connected, `node tools/converter-smoke.mjs --live --write --compare` should say `renderer: microsoft`.

## From the main window, 21 Oct 2026: one stamp in egbc-events.js (share)

For Martin's share fix, the reviewing window asked that What's On events in the app have Share too. egbc-share.js changed:
- the sheet now offers **WhatsApp** (wa.me: Web or Desktop on a computer), **Share…** and **Copy**;
- wa.me no longer reports a window that opened as blocked.

I moved the one stamp your file loads it with (egbc-events.js:614, `egbc-share.js?v=202610212300`), and egbc-events.js's own stamp on the pages, and regenerated public-mail-pages.cjs. **Nothing else in your file changed.**

Your share.test.mjs presses `[data-share]`. It still behaves as before: the system share sheet, else wa.me.

### F-259 — The 10:58 smoke run: the 422 and the 300-second wait, explained and fixed (the events window, 21 Oct)

**What happened**, from the converter's own log (read with `gcloud logging read`):
- **The request** arrived at **10:58:12** and took **323 s**. Cloud Run's request log stamps the time a request came in, so the 422 was not "30 s in".
- **The light copy now works,** so the 729 MB deck took more than 5 minutes.
- **At 302 s,** Node's fetch (undici) stopped waiting for the reply's headers: "fetch failed". That's its built-in 300 s limit, whatever timeout is asked for.
- **The tool then cleaned up:** it deleted the deck record and its files while the converter was still working.
- **At 323 s** the converter finished, went to mark the deck "ready", found the record gone, and answered **422**. The reason went nowhere: the server didn't log it.
- **The second instance at 10:58:22** was Cloud Run starting a spare (concurrency 1). Nothing else was wrong.
- **ffmpeg did not fail:** there's no "ffmpeg (light copy)" line in the log, so the light copy was most likely made. Only the last write failed.

**The same 300 s trap was in the hub's functions:** `google-auth-library` 11 uses fetch underneath. A big deck through the planner would have ended with "could not be made" while the converter carried on.

**Fixed**
- **One long request for everyone:** `functions/longpost.js` (`postJson`) uses plain `node:http(s)`. It has no header or body time-out of its own, only ours: 960 s, a little past Cloud Run's 900. It's used by:
  - `presentConvert` and `presentFromLink`: their ID token now comes from `getRequestHeaders`, and they wait up to **1000 s**
  - `tools/converter-smoke.mjs`
- **The tool never cleans up mid-work:** if its request fails anyway, it follows the deck until it says ready or failed (up to 16 minutes from the start), and only then deletes. It prints what the deck said.
- **The converter logs every result,** with the reason for every refusal (`runJob` in convert.mjs, which the web service runs for each request):
  - `convert <deck>: started`
  - `convert <deck>: ready, 4 slides, in 312 s`
  - `convert <deck>: REFUSED after 323 s: <the error>`

**The check: `screenshots/events/present-slow.test.mjs`, with a slow stand-in converter that answers after 330 s (about 6 minutes): 7/7.**
1. The shared request waits the 330 s and gets the answer. Plain fetch, run alongside, gives up at about 300 s, as on deploy day.
2. The hub's own `presentConvert`, on the functions emulator, waits past 300 s (331 s) and passes the answer on. The stand-in records that its caller never gave up first.
3. The smoke tool, against a stand-in that drops the request and finishes the deck 20 s later, follows the deck to "ready". The converter's last write lands, and only then is everything deleted.
4. A refusal puts its reason in the converter's log.

**Breaks:** see the report.

**What to redeploy**
1. **The converter** (the `runJob` log lines): the same `gcloud run deploy` as F-257 step 12, with Martin signed in to gcloud.
   - **Worth considering:** `--cpu 4` instead of 2. The light copy is ffmpeg work and goes about twice as fast, which keeps a long video well inside the 900 s limit. The cost per deck stays about the same (twice the rate for half the time).
2. **The functions `presentConvert` and `presentFromLink`** (the long request, the 1000 s time-out). No other function changed. **No new secret or setting.**
3. **Then rerun:**
   ```
   node tools/converter-smoke.mjs --live --write --link "<the 729 MB link>"
   ```
   - **Expect:** `HTTP 200 in` 300–600 s; media on slide 4 `+ light m4-0-light.mp4`; the files list `m4-0-light.mp4`; "Cleaned up: nothing left".
   - **The converter's log** shows `convert smoke-…: ready, 4 slides, in … s`.
- **Breaks, 3 of 3 caught:**
  - the functions giving up before the converter is done
  - the tool cleaning up as soon as its request fails
  - a refusal with no word in the log
- **Rule Zero:**

  | Test | Result |
  |---|---|
  | present | 55/55 |
  | present-microsoft | 42/42 |
  | present-media | 8/8 |
  | functions-secrets | 5/5 |
  | present-slow | 7/7 |

### F-260 — Rooms on the day and after: arrivals, the caterers' list, room use, rooms side by side (the events window, 21 Oct)

The rest of the room booking list. Built, waiting for review.

**1. "We've arrived" (check-in for room bookings)**
- **The hirer** taps "We've arrived" on their booking's own page (my-booking.html), on the day, for a confirmed hire.
- **A member** taps it on their own booking in Book a room (rooms.html), on the day.
- **The office** has a new **Today** tab on Room bookings. It lists today's confirmed bookings: "Due 10:00", "Not arrived", or "Arrived 10:04 (the hirer said so)". It has a "Mark arrived" button, and "Not arrived after all" for a mistake. The tab shows how many have not arrived.
- **The flag:** a hire or a member's booking not marked arrived **30 minutes** after it starts shows as "Not arrived" in red.
  - Every 15 minutes, a new scheduled function (`arrivalCheck`) emails the site's bookings address **once** per booking, with the hirer's name and phone.
  - **Nothing is ever cancelled.**
  - The office's own bookings and events are never flagged.
  - Places sets the minutes per site (0 turns it off).
- **Saved as** `bookings/{key}.arrived = { at (the server's time), by: hirer | member | office, name }`. The flag is `arrivalFlaggedAt`.

**2. The caterers' list** (catering.html, "Catering orders" in the Menu)
- **A new function, `cateringSync`,** runs on every booking change. It keeps `cateringOrders/{booking key}` for each confirmed booking with refreshments, holding what the kitchen needs: day, serving time, room, numbers, items, dietary counts, notes and the booking's title.
  - **It holds nothing about who booked, and no prices.**
  - Cancelled means the order goes.
  - A changed booking updates the order and keeps how far the kitchen got.
- **The caterers** see the next 14 days, by day. They mark each order Prepared, then Served (with who did it), and there's a printable kitchen sheet.
- **Who:** the **Catering** team, the site's bookings admins, and admins. Anyone else is told the page is for the caterers.
- **The rules:** caterers can change only the state (and who and when). Only the server makes or deletes an order.

**3. Room use** (a new **Room use** tab on Room bookings)
- **For a month, per room:** hours open, hours booked (split into hires, members, office and events), church services from the rota (counted separately), closed days, booked % and "in use, with services" %. It also shows a week-by-week table and a CSV download.
- **Overlapping bookings are counted once.** Setting up and clearing away count as booked. Closed days (Close a room, including a room closed as part of a bigger one) are left out.
- **Opening hours** come from Places (08:00–22:00 unless set).

**4. Rooms side by side** ("Compare rooms" on Hire our rooms and Book a room)
- **Up to three rooms**, with:
  - their photo
  - how many each holds in every layout (never past the fire-safety maximum), with the most marked
  - the fire-safety maximum
  - floor area, floor and step-free access ("Not checked yet", never "No")
  - natural light
  - every facility any of them has
  - a link to each room's page

**5. Places, per site:** "Flag … not marked arrived after (minutes)" and "Open for bookings" from/to.

**Decisions I made (say if any is wrong):**
1. **The caterers are a team called "Catering".** Teams come from Teams and groups, so **the office needs to create a team with exactly that name** and add the caterers.
2. **Flagged:** hires and members' bookings only, 30 minutes after the start, one email, never cancelled.
3. **Room use's default day** is 08:00–22:00.
4. **The Menu:** I added "Catering orders" to egbc-menu.js (Events and rooms, after Room bookings, `team: ['Catering']`, `feature: 'roomBookings'`). I also added it to check-menu's APPROVED list and bumped the Menu stamp. **The main window may move or veto it.** Bookings admins reach the page from the kitchen list on Room bookings.

**Deploy (the reviewer):** two new functions, `cateringSync` and `arrivalCheck`; nothing else changed in functions. **No new secret or setting.** The rules (bookings `arrives()`, `cateringOrders`) go live at switch-over.

**Found and fixed on the way:** the caterers' page, while a master admin used "view as everyone", still used his own member id to find the sites he's a bookings admin of, so he saw orders a member wouldn't. The page audit caught it (2 reds). Now no member id is used while viewing as someone else, as `isOnPlanGroup` does.

**Found, not fixed (for the main window):**
1. **check-menu.mjs can't run on the events emulator yet.** b530e6cd gives the script my ports, but it serves the pages on 8868, and a page only uses the events emulators (8182/9098/9198) when served from **5601**. So its pages still go to 8181/9099. On my run, sign-in failed ("network-request-failed"), so nothing reached your emulator. The fix: serve on 5601 when the config is firebase.events.json. Until then, **please run it for the new "Catering orders" entry.** The part that did run passed: every page has a way in.
2. **Earlier, before b530e6cd,** I started check-menu once by mistake against your emulator and stopped it part-way. Its synthetic account (places.tester@example.invalid) may be left on a test team there. A rerun or restart clears it.
3. **The rules suite:** `u_lena` isn't treated as site_bk's bookings admin by the time the suite reaches its end, though she is at the R2 block. My block uses its own office person (`u_aroff`, site_ar) instead. I didn't chase why.

**Proved:**
- **The breaks, 18 of 18 caught:**
  - **the one that matters:** the caterers' order carrying who booked (unit, and browser)
  - late only after the grace minutes, not at them
  - the office's own bookings flagged (missed at first; caught after adding an office booking that started an hour ago)
  - overlaps counted twice
  - closed days counted
  - the CSV running a name as a formula
  - the check emailing every 15 minutes
  - a changed booking resetting the caterers' progress
  - compare ignoring the fire-safety maximum
  - the hirer saying "arrived" on any day
  - Places saving closing before opening
  - in the rules:
    - "arrived" twice
    - "hirer" on the office's booking
    - arriving changing other fields
    - any member reading orders
    - caterers changing the order
    - marking it as somebody else
- **Rule Zero, one test at a time** (from 14:25, under the reviewer's 3 GB gate):

  | Test | Result |
  |---|---|
  | roomday-unit | 47/47 |
  | roomday (browser) | 34/34 |
  | rules suite | 1711/1711 |
  | functions-secrets | 5/5 |
  | check-stamps | 6/6 |
  | r1-rooms, room-card | 27, 55 |
  | r2, r3 | 50, 42 |
  | close-room, combined-rooms | 29, 33 |
  | c5-hire-quote | 16 |
  | audits: catering, bookings-admin, hire, rooms, places-admin | 14 each |

## From the main window, 22 Oct 2026: your pages that open for people the Menu doesn't offer them to (audit "access" reds)

The reviewing window: **each page's guard must match who the Menu offers it to**, "View as" included. The full audit (6 roles × 4 sizes) finds these of yours opening for roles whose Menu does not offer them:

| Page | Opens for (not in their Menu) |
|---|---|
| attendance.html | areaAdmin (Worship admin), core, worship, kids, everyone (a plain member) |
| checkin.html | areaAdmin, core, worship, kids, everyone |
| building.html | areaAdmin, core, worship, kids, everyone |
| safeguarding.html | core, worship, kids, everyone |
| kids-admin.html | areaAdmin, core, worship |
| kids-checkin.html | areaAdmin, core, worship |
| events-admin.html | areaAdmin |
| present.html, present-guide.html | areaAdmin, core, worship, everyone (you are adding their reason) |

**For each page, one of three:**
1. **Tighten its guard** to the Menu's people.
2. **Show a soft refusal** in the words the audit already recognises (e.g. "This page is for …").
3. **If it opens off the Menu on purpose,** add it to `OFF_MENU_BY_DESIGN` near the top of `tests/audit-everything.mjs`: `{ roles: 'all' | [roles], why }`. The audit then passes it and shows the reason. For example:
   - check-in or registers reached from an event its team runs;
   - "the building" for whoever has been given a check;
   - "raise a concern" for anyone signed in.

Mine are done the same way:
- the Rota planner, Sunday service plan and Music Upload are now offered to the leaders their guards let in (`leaderOf` takes a list now);
- index.html is on the list (the public availability form);
- the audit now counts the "you" menu's links, and `page?x` when the page itself is offered.

### F-261 — Present: "when the hub goes live", and the thumbnails' scrollbar (the events window, 21 Oct)

**Asked by the reviewing window:**
1. **The words.** Present's messages said "when the church switches over to the new hub". A church may never switch over (Church HQ is for any church), so they now say **"when the hub goes live"**:
   - the quiz on phones (`functions/quiz.js`, `quizStart`)
   - adding slides (`functions/present.js`, `presentConvert`)
   - the session planner's PowerPoint step (session-planner.html)

   Other windows' messages still say "switches over" (church-meeting, church-settings, compliance, payments, giving, team mail, the planner email, peep, places floor plans). They're left for their owners to change.
2. **The scrollbar.** The row of slide thumbnails (and the viewers' faces on a phone) scrolls sideways. It now has no scrollbar on a touch screen, where the row is swiped, and a thin dark one where there's a mouse, instead of the browser's white bar.

**What to deploy:** the functions `quizStart` and `presentConvert` (the words only). The page change is live on the next push. **No new secret or setting.**

**Proved:**
- **A new check, `present-film.test.mjs`:** 5/5.
  - **The break** (the old styles): 2/5. It catches the white bar on a phone and with a mouse.
- **present:** 55/55.
  - The first run had 54: on the TV, a video started late (the TV at 0 s), under load.
  - The rerun, on its own, gave 55.
- **present-quiz:** 39/39.
- **Both tests now check the new words.**

## From the main window, 22 Oct 2026: safeguarding is the lead and deputy's (one change in your safeguarding.html)

The reviewing window, on the live site: a Kids Church admin saw everyone's DBS dates, because the Menu offered Safeguarding to any team admin and the rules let any admin read `leaderChecks`. Martin's rule: safeguarding is the lead and deputy.

**Changed:**
- **firestore.rules:** `leaderChecks` read is now a master admin, the site's lead or deputy, or the person themselves. It goes live when the church does. The rules tests have the deny and the allows; break → red.
- **egbc-menu.js:** Safeguarding, Safeguarding settings and Due for deletion are for master admins and the lead and deputy only.
- **safeguarding.html:605:** "everyone's checks" loads for `MASTER` instead of `ADMIN`; the lead and deputy still get their sites' checks. **Nothing else in your file changed.**

**Not changed, for you to decide:** an event's own safeguarding view still opens for that event's leaders and any team admin (`ADMIN`). Their reads of other people's checks will now be refused by the rules. Please make that view not ask for them, or say so.

### F-262 — A Lessons-only ChurchShow computer gets its lesson's song words (the events window, 21 Oct)

**Found by ChurchShow, while taking Lesson-mode pictures.** A computer paired for Lessons only (the Kids Church laptop will be) couldn't show a lesson's song. lessonFor sent a song step as just `songId`, `title` and `ccli`. ChurchShow then read `songs/{id}` itself, and the rules (`churchShowServices()`) let only a computer with the Services job read songs. So the step said "The hub refused this (PERMISSION_DENIED)".

**Fixed in lessonFor (functions only, no rules):** a song step now also carries `song: { title, artist, ccli, lyrics }`.
- **Only the words and the CCLI number** the screen shows under them, with no chords or links.
- **Only the songs the lesson's own steps name,** read by their ids (once per call), so nothing else from the library.
- **A song gone from the library** comes with no `song`, so ChurchShow's "no longer in the library" still shows.
- **Additive to egbc-lesson/1,** so an older ChurchShow is unaffected.

**Why this way, not a rule:**
1. **The rules don't go live until switch-over.** A rule change wouldn't help the laptop now; a functions deploy does.
2. **A rule letting a lesson computer read "just its lesson's songs"** would have to look up that day's plans on every song read, which is costly and easy to get wrong. lessonFor already knows exactly which songs the lesson uses, and it already sends the lesson's other content the same way.
3. **The laptop gets the words, never the library.**

**For ChurchShow (`src/lessonprep.js`):** use `st.song` when it's there, and only fetch `songs/{id}` when it isn't (an older hub):
```
const s = st.song || (st.songId ? await deps.song(st.songId) : null);
```

**Found, not fixed:** churchshow.js's comment says lessonFor reads `jobs.lessonGroups`. It doesn't: any active computer in a building gets all of that building's lessons, including a Services-only computer. Probably harmless, but it isn't what the comment says. **Say if lessonFor should give a computer only its own `lessonGroups`** (an empty list meaning none).

**Deploy:** the function `lessonFor` only. **No new secret or setting, no rules.**

**Proved, in `session-planner.test.mjs` (section 10b), with a computer paired for Lessons only:**
- **The check:** 56/56. It confirms, among other things:
  - the computer still can't read `songs/sg_lesson` directly (the rules are unchanged)
  - its lesson brings the words, artist and CCLI number
  - there are no chords or links
  - nothing of a song that isn't in the lesson
  - a song gone from the library has no words
- **Breaks, 3 of 3 caught:**
  - the step with no words (the fault)
  - the whole song record sent (chords, links)
  - a gone song sent as an empty song

  Break 1's run also failed one unrelated email check. It passed in the other three runs, so I counted it as a timing slip.

## From the main window, 22 Oct 2026: "when the hub goes live", not "when the church switches over" (your F-261 list)

The reviewing window: Val may never switch over, and Church HQ is for any church. Every "switches over" a person sees now says **"when the hub goes live"**:
- the pages and scripts in your F-261 list;
- the functions bible.js, gocardless.js, hq-mail-key.js, payments.js, planner.js and team-mail.js.

Changes in your files:
- egbc-events.js: CLOSED_WORDS, plus its "is it shut?" test, which now matches `/goes live|switches over/`, so functions deployed before this are still understood;
- events-admin.html;
- peep.html;
- places-admin.html;
- egbc-compliance-store.js and its server copy, still identical.

Stamps are moved and public-mail-pages.cjs is regenerated. **tests/check-going-live.mjs** fails if the old words come back anywhere a person sees them.

**Your tests that still look for the old words:**
- screenshots/events/payments-shut.test.mjs:44
- screenshots/events/session-planner.test.mjs:262–264
- screenshots/events/team-mail.test.mjs:136–141
- room-card.test.mjs only names it in a label

**Still saying "switch-over" on screen** (not "switches over", so not in the check yet; please reword):
- quiz.js:15 (a comment, fine);
- session-planner.html:533 "Not until switch-over."

## From the main window, 22 Oct 2026: three more access reds, from safeguarding becoming the lead and deputy's

Since the Menu now offers Safeguarding, Safeguarding settings and Due for deletion only to master admins and the lead and deputy, the audit finds these opening for a team admin (areaAdmin) whose Menu no longer offers them:

- **safeguarding.html** (no guard options: anyone signed in).
  - Open to all on purpose, for "Report a concern".
  - But a team admin sees the full home: "Leaders, ratios, checks, incidents and concerns".
  - Suggest: for anyone who isn't a master admin, the lead or deputy, or that event's leader, show only Report a concern, the policy and their own training, in the audit's soft-refusal words.
  - Or add it to `OFF_MENU_BY_DESIGN` with the reason.
- **safeguarding-settings.html** (no guard options).
  - Suggest the guard `data-master`, plus the lead and deputy, as the Menu now has it.
- **retention.html** (`data-admin="any"`).
  - It says "This list is for master admins", which the audit doesn't take as a refusal.
  - Suggest `data-master`, or "This page is for master admins".

### F-263 — "Present slides" in a video meeting: the engine's part is built; the hook for meeting.html, and two rule functions, for the main window (the events window, 21 Oct)

F-242 section 6, as agreed in F-247 (Step 1: Daily's own tiles in the strip).

**What it does**
- **The host** (whoever started as host) gets **"Present slides"** over the call. It offers:
  - **This meeting's slides:** anything already made for this meeting, to present (again).
  - **Add slides:** a PowerPoint file (up to 100 MB) or a OneDrive link (up to 1 GB). It's made into slides by the converter, exactly as in the session planner, and presented at once.
  - **Before the hub goes live** it says why and uploads nothing (as F-235).
- **While someone presents,** everyone in the meeting sees the slides large, and the call becomes a strip: **beside the slides on a computer** (300 px, on the right), **below them on a phone**.
  - The host gets the presenter's view: now, next, notes, timer, thumbnails and Blank.
  - Everyone else follows, or browses on their own.
  - No screen share: every screen already has the pictures. In the test, a slide change reached the other screen in 184 ms.
- **Stop,** and everyone is back to the faces.
- **Another host can take over,** and the first is told.
- **Leaving the meeting while presenting stops it,** so nobody is left on a slide.
- **A meeting's deck** is kept with its room, event and day. It goes 30 days after the meeting unless kept (`runPresentSweep`, already there).

**For the main window: the hook in meeting.html**
1. **Two scripts, in `<head>`:**
   - **Storage** (needed for the slide pictures): goes **before egbc-auth.js**. egbc-auth.js only connects Storage to the emulator if it's already there.
   - **egbc-present.js:** goes after egbc-auth.js.
   ```html
   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"></script>
   <script src="egbc-present.js?v=<new stamp>"></script>
   ```
2. **A div beside the call:**
   ```html
   <div id="present"></div>
   <div id="stage">…</div>
   ```
3. **After `frame = DailyIframe.createFrame(...)`:**
   ```js
   if (window.EGBCPresent) EGBCPresent.attachMeeting({ room, eventId: params.get('event') || '',
     el: document.getElementById('present'), call: document.getElementById('stage'), host: !!hostToken });
   ```
   - **Optional:** pass `button: <your own button>` to put "Present slides" in your own controls. Otherwise the engine puts a pill at the top centre of the call.
   - **No CSS is needed in meeting.html.** The engine adds `body.presenting` and its own layout. Adjust it if you like.
4. **In your rules (they go live at switch-over):** two functions, and four lines that use them.
   - **firestore.rules,** in my Present section: in `deckReads()` and `deckPresents()`, replace the meeting lines' `isMaster()` with:
     - `meetingInvitee(ctx.get('room',''), ctx.get('eventId',''))` in `deckReads()`
     - `meetingHost(…)` in `deckPresents()`
   - **storage.rules:** the same swap twice in `deckAudience()` / `deckPresenter()` (present/ block).
   - **Until then,** only master admins see a meeting's slides. Anyone else in the meeting just keeps the call, with no error (tested with a non-master Elder).
   - The server side already uses your **`mayHost()`**: `functions/present.js` `mayPresent()` asks it for a meeting (the church's rooms from `churchSettings/video`, the event's organiser and room).

**Rules (my Present section; live at switch-over):**
- **A meeting deck's context** is exactly `{ type, room, eventId, day }`.
- **A meeting's shared state** (`presentNow/mtg_<room>_<event or day>`) must name its **`deckId`**, and that must be a deck made for the **same meeting room**. So every screen loads the same slides, and a meeting can never be pointed at another room's (or a session's) deck.

**What to deploy (the reviewer):** the functions `presentConvert` and `presentFromLink`. Only `mayPresent` changed (meetings now ask `mayHost`). **No new secret or setting.** egbc-present.js goes live with the push, but it does nothing until meeting.html calls it.

**Questions still open from F-242 (Martin's):**
- **Question 2:** may an invitee who isn't a host take over if the host allows it? It's built hosts-only for now.
- **Step 2 (our own tiles):** comes after this, with the main window.

**Proved:**
- **`present-meeting.test.mjs`:** 31/31. It drives a stand-in for meeting.html (`screenshots/events/meeting-harness.html`) with meeting.html's layout and the hook exactly as above.
  - **The host:**
    - adds a real PowerPoint after go-live (the converter's real code)
    - presents it, with notes
  - **Another screen:**
    - follows in 184 ms
    - sees no notes and no "Present slides"
  - **The layout:**
    - the call is 300 px wide beside the slides on a computer, and below them on a phone
    - nothing scrolls sideways at 375 px
    - stop brings everyone back to the faces
  - **Presenting again, taking over, leaving:**
    - present again from "This meeting's slides"
    - take over
    - leave while presenting, and it stops
  - **Before the hub goes live:** nothing to upload.
  - **A non-master Elder** just keeps the call, with no error.
  - **The server:** host / admin of the room's team / host team / organiser are allowed. The organiser in another room and a non-host Elder are refused.
- **Breaks, 8 of 8 caught:**
  - **The one that matters:** the others don't follow the host.
    - My first try removed the line and left the file broken. I redid it as a proper break.
  - the call not made a strip
  - leaving while presenting leaves everyone on a slide
  - uploading before the hub goes live
  - the server letting any member add slides
  - **in the rules:**
    - another room's deck
    - a context carrying anything
    - no deck named
- **Rule Zero, one test at a time, more than 3 GB free:**

  | Test | Result |
  |---|---|
  | rules suite | 1727/1727 |
  | present | 55/55 |
  | present-quiz | 39/39 |
  | present-film | 5/5 |
  | present-meeting | 31/31 |

## From the main window, 22 Oct 2026: F-263 wired in; reasons for present, present-guide and quiz

**meeting.html, as your F-263 asks:**
- Storage before egbc-auth.js, and egbc-present.js after it;
- `<div id="present">` beside `#stage`;
- `EGBCPresent.attachMeeting({...})` once the Daily frame is made. Hosts only.

**The rules.** `meetingHost()` and `meetingInvitee()` are in firestore.rules (and as `meetingHostStorage` / `meetingInviteeStorage` in storage.rules). Your four lines use them. They give the same answer as `mayHost()`:
- **Host:** a master admin, an admin of the room's teams, anyone on its host teams, or the organiser of an event in that room.
- **Invitee:** a host, anyone on the room's teams, or church members for a room marked `members` (CMM).
- Rules can't search a list, so the room comes from **`churchSettings/video.roomsByKey`**. ensureRooms now keeps that beside `rooms`, and egbc-video.js asks for it once if it's missing.
- Rules suite **1738/1738** and Storage **131/131**, with host, invitee, member, organiser and outsider cases. Break: back to master-only → 7 red.

**tests/check-meeting-present.mjs: 8/8, two browsers at 375.**
- The host presents from "Present slides".
- A follower on the room's team sees slide 1 of 2, then follows to slide 2 in 321 ms. They have no Present or Stop of their own, and are back to the faces when the host stops.
- Break: no attachMeeting → 5 red.

**Reasons added for your three pages.** Please correct the words if they're not yours:
- In check-menu's NO_MENU:
  - present.html: full-screen slides, a bar would cover them;
  - present-guide.html: the guide beside Present's dark pages;
  - quiz.html: a player's phone with no account.
- In the audit's OFF_MENU_BY_DESIGN: all three, open to anyone signed in, showing nothing of anybody's.

check-menu is **96/96**.

### F-264 — Present in a meeting: the host can let one other person present (Martin's answer to F-242 question 2; the events window, 21 Oct)

**What Martin asked:** a non-host invitee may present, but only if the host allows it. The host can take it back at any time, and when the host leaves or ends the meeting it stops. Nobody presents without the host's say-so, and the server checks it too, not only the button.

**What it does**
- **The host's "Present slides" sheet** now has **"Let someone else present"**: everyone signed in who is in the meeting, each with **"Let <name> present"**.
  - **One person at a time:** letting a second person takes it from the first.
  - The person allowed is shown, with **"Take it back"**.
- **That person** then gets "Present slides". They can pick this meeting's slides or add some (a file or a OneDrive link), present, and take over.
- **"Take it back":** their presenting stops at once, their button goes, and the rules and the server refuse them again.
- **The host leaves the meeting** (the page closes, or Daily's "left-meeting" if meeting.html passes `frame`): the say-so ends and the presenting stops, in **one commit**.
  - Two separate writes lost the second one as the page closed. That's caught by the check, and fixed.
- **A host whose connection is lost:** the host's page renews the say-so every minute, and **the rules and the server stop counting it 3 minutes after the last renewal**. The allowed person's own page stops presenting at 2½ minutes, while still allowed, so nobody is left on a slide.

**The checks are on the server, not only the button:**
- **Firestore rules:** a meeting's decks, slides and presenting (`deckPresents`/`deckReads`) are allowed for a host, OR the person with a live say-so for that meeting (`presentAllowed(ctx)`). The say-so itself can only be set, renewed or taken back by a host, in their own name, with the server's time.
- **Storage rules:** the same, for the slide pictures and the uploaded PowerPoint.
- **Functions** (`presentConvert`, `presentFromLink`): `mayPresent()` asks your **`mayHost()`**, and otherwise a live say-so for that person in that meeting.

**FOR THE MAIN WINDOW: please agree these names (the rules are yours)**
1. **The say-so:** `presentAllow/<meeting key>_<uid>`, where the meeting key is `mtg_<room key>_<event id, or the London day YYYY-MM-DD when there's no event>`.
   - Fields: `{ context: { type: 'meeting', room, eventId, day }, key, uid, name, by (the host's uid), at, aliveAt (server time, renewed each minute) }`.
   - One document per person, so each person reads only their own and the host lists them by `key`.
2. **Who is here** (for the host's list): `presentHere/<meeting key>_<uid>` = `{ context, key, uid, name, at }`. Each signed-in person's own record, kept fresh by their page and deleted when they leave. Only a host and the person read it.
   - Now that your `meetingInvitee()` is in, I suggest only invitees may write one. That's one line, yours to choose.
3. **Your `meetingHost()` / `meetingInvitee()` (4326c633) are in use.** We wrote into the same lines at the same moment; I kept yours exactly. My `meetingHostE(ctx)` / `meetingInviteeE(ctx)` now just call them with the context's room and event. Storage is the same: your `meetingHostStorage` / `meetingInviteeStorage`, or my `deckAllowed`.
   - **One of your rules checks changed:** "and presents it" now gives its meeting details event `ev_m9`, to match its key `mtg_Eldership_ev_m9`. A meeting's shared state must now sit under that meeting's own key, not any `mtg_…`, so it can't be written under another meeting's key. Rules 1760/1760, Storage 131/131.
4. **meeting.html:** please bump to `egbc-present.js?v=202610220030`. It still has 202610212330, so browsers would keep the old engine. Optionally also pass `frame` (Daily's call object) to `attachMeeting`, so "left-meeting" ends a host's say-so even before the page closes.

If you'd rather a different name or shape, say so: it's one constant in the engine, the rules and the server.

**What to deploy (the reviewer):** the functions `presentConvert` and `presentFromLink` (`mayPresent` now also reads `presentAllow`). **No new secret or setting.** The rules go live when the hub goes live.

**Proved:**
- **`present-meeting.test.mjs`:** 54/54, three runs in a row (one before a timing fix, two after).
- **New sections 9 to 13**, with Sam: an Elder who is invited but not a host.
  - **9. Sam can't present without the say-so:**
    - he has no button
    - **the server refuses his `presentConvert`**
    - the rules refuse him moving slides
    - he can't give himself the say-so
  - **10. The host lets Sam present:**
    - the host's people list shows "Let Sam present"
    - the say-so is saved with the server's time
    - Sam gets "Present slides" and adds his own PowerPoint (the server made it, so his say-so counted)
    - everyone follows, and he moves the slides on
  - **11. "Take it back":**
    - his presenting stops at once
    - his button goes
    - the rules and the server refuse him again
  - **12. The host leaves the meeting:**
    - the say-so ends
    - his presenting stops
    - his button goes
  - **13. A say-so not renewed for 4 minutes (a host whose connection is lost):**
    - the rules and the server refuse it
    - his page offers nothing
    - `mayPresent`: stale no, fresh yes, someone else's say-so no
  - **Section 7 now uses main's rules:**
    - an Elder (invited) follows the slides
    - someone not invited (the office) keeps the call, with no error
- **Found and fixed on the way:**
  - **Leaving:** the host's leaving was two writes, and the second was lost as the page closed. Now it's one commit.
  - **A timing race:** a viewer's slides could finish loading after the presenting had stopped, leaving a stale view. Now it checks someone is still presenting them first.
- **Rules:** 1760/1760, with new checks for the say-so (set, renewed and taken back by a host only; the server's time; runs out after 3 minutes) and for who is here. **Storage:** 131/131.
- **Breaks, 7 of 7 caught, run again after merging with main's rules:**
  - **The one that matters:** the server letting an invitee who wasn't allowed add slides.
  - **In the rules:**
    - presenting without the say-so
    - a say-so that never runs out
    - an invitee giving himself the say-so
  - **Take it back** not stopping the presenting.
  - **The host leaving** not ending the say-so.
  - **The server:** a say-so that never runs out.
- **Rule Zero, one test at a time, more than 3 GB free:**

  | Test | Result |
  |---|---|
  | present | 55/55 |
  | present-quiz | 39/39 |
  | present-film | 5/5 |

### F-265 — A safeguarding risk register: PLAN, for review before building (the events window, 22 Oct)

Martin wants the safeguarding version of the Live risk register (risk.html), next to safeguarding.html. **Nothing is built yet.**

**The one rule above all:** the register holds risks, controls, dates and **counts**. It never holds or shows a concern, an incident's people, a child, or a medical detail. Where a warning needs names (which leaders, which children), it links to the page that already shows them, and that page's own rules decide who sees the names.

---

**1. Who**

| | Read | Edit risks and assessments | Sign off an event | Annual review items | Snapshots |
|---|---|---|---|---|---|
| The site's safeguarding lead and deputy (`sgLeadOf(siteId)`) | yes | yes | **yes (only them)** | yes | no |
| Trustees (the trustee team, Elders at EGBC) | yes | no | no | yes (the trustees' own items) | **yes** |
| Master admins | yes | no | no | no | yes |
| Everyone else, activity leaders included | no | no | no | no | no |

- **Trustees, any church:** risk.html says `onTeam('Elders')`. A church's trustees may be called something else, so this register reads **`safeguardingSettings/defaults.trusteeTeam`** (default "Elders"; set on Safeguarding settings).
- **Master admins don't read concerns today, and nothing here changes that.** The register never holds one.

---

**2. Pages and tabs:** one new page, **`safeguarding-risk.html`** ("Safeguarding risks").
- **Linked from** safeguarding.html's home ("Safeguarding risk register").
- **In the Menu** beside Safeguarding (`sg: true`), plus trustees and master admins.
- **A site picker** when the person keeps more than one site.

**Tab A: Standing risks** (part 1)
- One card per **activity**.
- **Activities are built from what the hub already knows:**
  - each Sunday group (`kidsGroups`)
  - each children's or youth planner group (`planGroups` kind children/youth)
  - each under-18s small group (`smallGroups.under18`)
  - clubs (events whose `eventLeaders.under18` is on, grouped by name)
- **Plus fixed kinds, added with one tap:** online and livestream; pastoral visits; transport; lone working; hirers working with children.
- **Each risk:**
  - what could happen, and to whom (in general words)
  - likelihood × impact (1–5 each, the same rating as risk.html)
  - its controls
  - an owner (a person)
  - a review date
  - the residual rating after the controls
- **Controls are either:**
  - **a linked control:** one of the hub's own checks, which the live warnings watch (part 3), or
  - **written:** for things the hub can't see ("two leaders walk children to the toilets").
- **"Add from the starter list":** a starter set of risks for each kind of activity (section 5). The lead adapts them.
- **Closing a risk keeps it** (as risk.html; nothing is deleted).

**Tab B: Event assessments** (part 2)
- **Events needing one** (section 4) are listed, soonest first, as: needs one, being written, waiting for sign-off, signed.
- **"Start from a template":** trip, holiday club, sleepover, off-site.
  - The template's questions are things like where, travel, overnight, first aider, ratios, meeting point, hand-back.
  - It also brings the template's starter risks, each with controls and ratings.
- **"Sign it off":** the lead or deputy of the event's site only. The sign-off records who and when, and which version.
  - **Changing a signed assessment** takes it back to "waiting for sign-off".
  - Sign-ups already made stay; new ones wait until it's signed again.
- **Read-only print view**, to take on the trip.

**Tab C: Warnings** (part 3)
- Everything amber or red now, worst first.
- **Each line says:**
  - what has slipped, as a count and a date only
  - what to do
  - a button to the page that fixes it
- **Example:** "Juniors, today: 14 children in, 2 leaders in; needs 3. → Sunday check-in."
- **Risks follow their controls:** a risk takes the worst colour of its linked controls, so a risk whose control has slipped turns amber on Tab A by itself.

**Tab D: Annual review** (part 4)
- **The year's checklist,** each item dated with who did it and a note:
  - the policy reviewed
  - the policy adopted by the trustees (the trustees record this item)
  - the trustees' safeguarding training
  - safer recruitment followed (spot-checked)
  - the lead and deputy named (shown from settings, and confirmed)
  - the register reviewed (all risks looked at this year)
  - the hirers' policies checked
  - the annual return or report made, where the church's rules need one (optional)
- **The year's status:** done, under way, or overdue. It's overdue a year after last year's review.

**Tab E: Snapshots** (trustees and master admins take them; the lead and deputy read them)
- **A dated copy:** the risks with their ratings, the warnings counts and the review's status.
- **Never changed after.**
- **Its banner must begin "Safeguarding risk register:"** (rules, as risk.html's "Live risk management:"), so it's never mistaken for a formal assessment by an outside body.

---

**3. Firestore shape and rules** (my events section; live when the hub goes live)

| Collection | Fields | Read | Write |
|---|---|---|---|
| `sgActivities/{id}` | `siteId, kind ('sunday'\|'youth'\|'club'\|'online'\|'pastoral'\|'transport'\|'lone'\|'hirers'\|'other'), name, link {type: 'kidsGroup'\|'planGroup'\|'smallGroup'\|'clubName', id}, active, updatedAt, updatedBy` | sgRegSees | sgLeadOf(siteId) |
| `sgRisks/{id}` | `siteId, activityId, risk (≤200), who (≤120), l, i (1–5), controls [{kind, text (≤200)}] (≤20), ownerId, ownerName, reviewDue, rl, ri (1–5), status 'open'\|'closed', source, starterId, createdAt, updatedAt, updatedBy` | sgRegSees | sgLeadOf; no delete |
| `sgAssessments/{calEventId}` | `siteId, calEventId, templateId, title, answers {fixed keys, short text}, risks [same as above, ≤40], status 'draft'\|'waiting'\|'signed', version, signedBy, signedByName, signedAt, signedVersion, updatedAt, updatedBy` | sgRegSees, and the event's own leaders (to take it on the trip) | sgLeadOf; only the lead or deputy sets 'signed' (signedBy == them, at request.time) |
| `sgWarnings/{siteId}` | `items [{id, kind, level, label, count, date, fix}] (≤100), at` | sgRegSees | **the server only** |
| `sgReviews/{year}` | `items {itemId: {at, by, byName, note (≤300)}}, updatedAt` | sgRegSees (any site) | lead/deputy of the lead site, or the trustee team: only to add their own items |
| `sgSnapshots/{id}` | `siteId, banner ('^Safeguarding risk register: .*'), by, byName, at, note, risks (≤200), warnings, review` | sgRegSees | create: trustees and master; never changed |
| `calEvents` | **new field `sgSignoff: 'needed'\|'none'`** | | see section 4 |

- **`sgRegSees(siteId)`** is `isMaster() || sgLeadOf(siteId) || onTeam(trustee team)`.
- **What protects need-to-know** (the rules can't read words):
  - The shapes (`hasOnly`, length caps) leave **no field for a name, a child, a concern or a medical detail**. `ownerId`/`ownerName` is a leader, not a child.
  - The page puts a reminder beside every free-text box: "General words only: never name a child, a family or a concern."
  - Warnings are written by the server and hold **counts only**.

---

**4. "Waiting for safeguarding sign-off" on an event** (part 2)
- **Which events:**
  - On events-admin.html, an event gets **"Needs a safeguarding assessment"**.
  - It's ticked by itself when the event is under-18 (`eventLeaders.under18`) and marked a trip, overnight, holiday club or off-site.
  - The organiser can tick it too.
  - **Only the lead or deputy (or a master admin) can untick it.**
- **While it's needed and not signed:**
  - signup.html, What's on and the app show **"Bookings open after safeguarding sign-off"**, with no Book button.
  - **The rules refuse a sign-up:** `canSignUpTo()` gains "and (`sgSignoff != 'needed'` or `sgAssessments/{id}.status == 'signed'`)". So it's the database, not just the button.
- **A gap found on the way, worth fixing in the same change:** the rules don't check `signupOn` or `status` on a sign-up at all today. The page hides the button, but a sign-up can still be written to a closed or cancelled event while its capacity record exists.

---

**5. Live warnings: what each reads, and how it stays need-to-know** (part 3)

**One server job, `sgWarningsSync`:**
- **When:** every 15 minutes, plus when check-ins or leader checks change.
- **What it does:** reads each site's data with the Admin SDK and writes `sgWarnings/{siteId}` as **counts, dates and a link**: no names, no children, no medical details.
- **Why the server:** trustees may read the warnings, but not the leader checks, check-ins or children behind them. The lead clicks through to the existing pages, which show names only to those already allowed.

| Warning | Reads (existing) | Amber / red | Fix link |
|---|---|---|---|
| **Ratio short, today** (each Sunday group) | `kidsLeaderIns` (leaders in) vs `checkins` children in, against `kidsGroups.ratio` | amber when short; red when short for 10 min | kids-checkin.html (and the app's Today) |
| **Ratio short, coming events** (next 14 days) | `eventLeaders` (named leaders, ratioAll/ratioUnder8) vs confirmed `signups` (the existing `SG.ratio()` maths) | amber; red within 2 days | safeguarding.html?event= |
| **Two adults** | the same counts: children in, fewer than 2 leaders in (Sunday); under-18 events with fewer than 2 named leaders | amber; red when children are in now | kids-checkin.html / safeguarding.html?event= |
| **Checks** | `leaderChecks` (dbsSeen + dbsYears, trainingDate + trainingYears) for leaders named on under-18 groups, teams and event leaders | amber within 6 weeks; red when run out | safeguarding.html ("running out") |
| **Consent** | registered `kidsChildren.consentUntil` (missing or past), per group; for events, children booked whose consent form isn't done (`formRequests.status`) | amber; red for an event within 7 days | kids-admin.html Children; forms-admin.html chase |
| **Event not signed off** | `calEvents.sgSignoff` + `sgAssessments.status` | amber; red within 7 days of the event | Tab B |
| **Hirers with children** | `hirers.documents` safeguarding (missing or expired) for hirers with bookings in the next 30 days who said they work with children | amber | bookings-admin.html Hirers |
| **Reviews due** | `sgRisks.reviewDue`, `sgReviews` (last year's) | amber when due; red a month after | Tab A / Tab D |

- **Linked controls:** each kind above is a control a risk can use. So "Juniors: not enough leaders" with the control *ratio* turns amber when that group's ratio warning is on.
- **A new check: the two-adult rule.** Nothing in the hub checks two adults today. This adds it as a warning, not a block.
- **Consent is per year (or school year), not per term:** the hub's consent forms last a year or a school year, and that's what's read. Per-term consent is for later, if wanted.

---

**6. Starter templates, written by us** (in a new `egbc-sg-templates.js`; plain words, no wording from any one body's documents)

- **Standing risks, by activity kind, for example:**
  - **Sunday children's group:**
    - a child leaves unnoticed (controls: check-in and out, collectors on the form)
    - too few leaders (ratio; two adults)
    - an unchecked adult alone with children (checks; two adults)
    - an allergy or medical need missed (consent form)
    - photos shared without consent (consent form)
  - **Youth group:** the same, plus:
    - private messaging between a leader and a young person (written control: group channels only)
    - lifts home (transport)
  - **Online and livestream:**
    - children shown or named without consent (consent form)
    - chat used to contact a child (written control: chat moderated or off)
  - **Pastoral visits:**
    - a visitor alone with someone at risk (written control: visit in pairs or tell someone)
    - concerns not passed on (written control: the report-a-concern route)
  - **Transport:**
    - unchecked drivers (checks)
    - no booster seats or insurance (written)
    - lone adult and child in a car (two adults)
  - **Lone working:**
    - nobody knows where they are (written control: sign in and out with someone)
  - **Hirers with children:**
    - no safeguarding policy (hirer document)
    - the hirer's leaders unchecked (written control: the hirer confirms their checks)
- **Event templates:**
  - **Trip:** travel, meeting and hand-back point, headcounts, first aid, lost-child plan
  - **Holiday club:** registration, ratios by age, collection, allergies, photos
  - **Sleepover:** sleeping arrangements, two adults at all times, night-time cover, medication
  - **Off-site:** the venue's own risk assessment seen, toilets and boundaries, emergency contacts
- **Any church:**
  - no church's name, team names or policy wording is built in
  - activities come from the church's own groups
  - the trustee team is a setting
  - the check's name follows the church's settings: "DBS" in England and Wales; "PVG" or "AccessNI" can be set; "criminal record check" if none is set
  - the 2-adult rule and the warning thresholds are settings with sensible defaults

---

**7. Switch:** a new add-on **"Safeguarding risk register"** (off by default, on at EGBC).
- **For the main window:** this needs your `FEATURES` lists (egbc-auth.js and functions/features.js) and the `churchSettings/features` key in the rules.
- With it off, the page says so, and the server job does nothing.

---

**8. Checks and breaks** (one test at a time, more than 3 GB free)

**Unit (no emulator):**
- the warnings builder with invented data: ratio, two adults, checks, consent, sign-off, hirers, reviews
- a risk takes its controls' worst colour
- every starter template is complete
- the snapshot banner wording

**Rules:**
- who reads and edits each collection
- only the lead or deputy signs off
- signing must name the signer and use the server's time
- **sign-ups are refused for an event waiting for sign-off, and allowed once signed**
- `sgWarnings` is written by the server only
- snapshots need the banner and are never changed
- **no field exists for a child or a concern** (an extra field is refused)

**Browser:**
- the lead builds a group's risks from the starter list
- a leader's check runs out, so the risk turns amber with "what to do" and a working link
- a Sunday session goes short of leaders and then has only one adult: the warnings appear, then clear when a second leader checks in
- an event shows "Bookings open after safeguarding sign-off"; a sign-up is refused; the lead signs it and booking opens; a change after signing closes it again
- a trustee reads and takes a snapshot but can't edit
- an activity leader and an ordinary member see nothing
- **no child's or leader's name appears anywhere** in what a trustee is shown (checked against the invented names)
- 375 px and computer, with pictures

**Breaks (planned):**
- **The one that matters:** a warning carries a child's or leader's name to the trustees.
- the sign-off not gating sign-ups (rules)
- someone other than the lead signing
- a slipped control not turning its risk amber
- the two-adult warning missing when one adult is in
- a snapshot without the banner
- a trustee editing a risk

---

**9. For later** (not in this build)
- Activity leaders seeing their own activity's risks, read-only.
- Lone-worker "I'm in / I've left" with a timed check (FINDINGS 7591 already has the idea).
- Driver and vehicle records for transport.
- Per-term consent.
- A pastoral visits log.
- Consent for filming children, separate from photos.
- Reminder emails for reviews and sign-offs (the warnings show them first).
- The multi-church copy under `churches/{id}/…`.
- Under-18 team names read from `teams/{name}.under18` in the rules, rather than the fixed four (found on the way: `under18Teams()`).

---

**10. Questions for review**
1. **Trustees:** is a setting with "Elders" as the default right?
2. **Event sign-off:** should an event need one automatically when it's under-18 and a trip, overnight, holiday club or off-site? And may only the lead or deputy (or a master admin) say an event doesn't need one?
3. **The annual review:** church-wide (one per year; the policy is the church's), with the lead site's lead and deputy plus the trustees recording items. Or one per site?
4. **The gap in section 4** (sign-ups not checking `signupOn` or `status`): fix it in the same change?
5. **Two adults:** a warning only (as planned), or should a group with children in and one leader also alert the lead by email?

### F-265, continued — two additions from Martin: AI-drafted event assessments, and a safeguarding dashboard with dials (PLAN, for review; the events window, 22 Oct)

---

**A. AI-drafted risk assessments** (part 2, one-off events)

**What the leader sees**
- **Where:** Tab B (event assessments), for an event that needs one, with **"Describe the event, and get a first draft"**.
- **Who can use it:**
  - the event's organiser and its named leaders
  - the lead and deputy of its site

  (Signing off is still the lead or deputy only.)
- **The text box:** plain words, up to 4,000 characters.
  - An example is shown: *"A day trip to the coast for 30 children aged 8–11, by coach; 5 adults; swimming in the sea; lunch on the beach."*
  - Above the box, in plain words: **"Don't put in any child's name, anyone's contact details or anyone's medical details. Describe needs in general: 'two children need an adult with them at all times'."**
- **"Draft it"** returns, in about half a minute, an editable draft in Tab B's usual form:
  - each hazard: who's at risk, likelihood × impact, red/amber/green before and after the controls, the controls, an owner (a role, e.g. "the trip leader") and a review point
  - an overall red/amber/green at the top
  - **"Must not go ahead as described"** items, in a red box, plainly worded: *"This must not go ahead as described."*
  - questions the leader should answer (e.g. "Who is the trained first aider?")
- **The draft is labelled "First draft by AI: check every line".**
  - It **counts for nothing until the lead or deputy signs it off.** The event's bookings stay closed until then (section 4 of the plan).
  - **Signing off a draft with any red item left** needs a typed reason. A "must not go ahead" item can't be signed while it's there; it has to be changed or removed first.

**The server: the callable `sgDraftAssessment({ calEventId, text })`**
1. **Who:** signed in and active; the organiser or a named leader of that event, or the lead or deputy of its site. Anyone else is refused.
2. **The switch and the key:**
   - The add-on is on.
   - The key is **`CHQ_ANTHROPIC_API_KEY`**: a new `defineSecret`, **announced here first as you asked**. Martin sets it in Secret Manager.
   - Empty or **"NOT-SET"** means not set up. The button then says: *"AI drafting isn't set up yet for this church. Write the assessment from a template instead."*
   - A small `sgAiStatus` callable tells the page ready / not set up / today's limit reached, before anyone types.
3. **Personal data, refused where the server can tell:**
   - **Refused:** email addresses, phone numbers, postcodes, dates of birth, NHS-style numbers, and **any name of a child, parent or collector the hub holds for that event** (its sign-ups and their forms). The refusal says *"It looks like this has a child's name in it"*, without repeating the name.
   - **Warned, not refused:** common medical words next to a capitalised name.
   - Medical words alone in general terms ("some children have allergies") pass.
4. **The facts the hub knows,** added as context and **worked out by the server, not the AI:**
   - children booked and how many are under 8
   - the leaders named, and how many are cleared
   - the church's ratios (e.g. 1 to 5, and 1 to 4 for under-8s; from safeguarding settings, or the event's own)
   - whether the event is overnight or off-site
   - **The server adds its own hazard when leaders are short:** *"Not enough leaders: 7 needed for 30 children (6 under 8); 5 named"*, red, with "must not go ahead as described" until more leaders are named. It's marked "from the hub's numbers".
   - The AI is told the numbers, but **its own arithmetic is never used**: ratings and the overall rating are recomputed on the server (score = likelihood × impact; 15+ red, 5+ amber, below 5 green, as risk.html), and the overall is the worst after controls.
5. **The call:**
   - **The SDK:** Anthropic's official JS SDK (`@anthropic-ai/sdk`) in functions/, model **`claude-sonnet-5-5`** (as Martin asked), from the server only.
   - **The answer's shape** is fixed by **structured outputs** (`output_config.format`, a JSON schema), so the answer must match the schema. (Forcing a tool call to get JSON isn't allowed on this model.)
   - **The fixed instructions** (how to assess, the rating scale, plain UK English, "say plainly when something must not happen") are cached between calls.
   - **Limits:** `max_tokens` 16,000, a 120-second time-out, and the SDK's 2 retries on busy/overloaded.
   - **A refusal by the model** (`stop_reason: "refusal"`) says *"The AI couldn't draft this one. Use a template."*
   - **Server-side fallback:** I'd normally turn on Anthropic's fallback to another model when this one refuses. **Say if you'd rather not.**
6. **Checked before it's saved:**
   - every hazard has who, the ratings, at least one control and an owner role
   - ratings are recomputed (step 4)
   - anything malformed is refused with *"The draft came back incomplete; try again"*, and nothing is saved
7. **Saved** into `sgAssessments/{calEventId}` as `status: 'draft'`, with `source: { kind: 'ai', model, at, by }`.
   - The **leader's text is not kept** (it may carry things it shouldn't). They can paste it again.
   - Only the draft (hazards, controls, roles) is kept, under the same shape rules as a hand-written one.
8. **Logged:** `sgAiLog/{id}` = `{ siteId, calEventId, by, byName, at, chars, outcome ('drafted'|'refused-personal'|'refused-model'|'failed'|'capped'), tokensIn, tokensOut }`.
   - **No text, ever.** The function's own log lines carry ids and counts only.
   - Read: master admins and the site's lead and deputy. Written by the server only.
9. **Capped:**
   - per church per day (default 20) and per person per day (default 5), counted in `sgAiUse/{YYYY-MM-DD}` in a transaction
   - the caps are in safeguarding settings
   - over the cap: *"Today's limit is reached; try tomorrow, or use a template."*
10. **The text goes to Anthropic's API and nowhere else:**
    - no email, no other service, nothing in the hub's own logs
    - the page says so in one line: *"Sent to Anthropic's Claude to draft; not kept by the hub."*

**Checks for A**
- **Without the real API:**
  - On the emulator only, the function talks to a **local stub** in place of Anthropic: the SDK's `baseURL`, set only when `FUNCTIONS_EMULATOR`.
  - The stub returns, in turn:
    - a good draft
    - a draft with wrong arithmetic (the server's ratings win)
    - a draft that misses the ratio shortfall (the server adds it)
    - a "must not go ahead" draft (red, and it can't be signed until changed)
    - a refusal
    - malformed JSON (nothing saved)
    - a busy reply, then success (retried)
  - It also records what it was sent, so the test proves **no child's name, no email and no stored data beyond the counts** left the hub.
- **Refusing personal data:** a child's name from the event's sign-ups, an email, a phone number. Each is refused **before** any call (the stub sees nothing).
- **Not set up:** an empty or NOT-SET key gives the plain message, with no call.
- **The cap:** the 21st draft in a day is refused.
- **Rules:** nobody writes `sgAiLog` from a page; a draft can't be marked signed by its author unless they're the lead or deputy.
- **One real call, only with Martin's say-so:**
  - `tools/sg-ai-smoke.mjs --live --event <invented test event>`, using Martin's Brazil example.
  - It checks the draft parses, is **red overall**, has "must not go ahead" items (children alone in a prison; leaders far too few), and that the server's ratio hazard is there.
  - It prints the token counts, and deletes its draft and log entry after.
- **Breaks (planned):**
  - **The one that matters:** the AI's own red/amber/green trusted instead of the server's
  - a child's name passing the check
  - the leader's text being kept in the log
  - the ratio shortfall left to the AI
  - a draft opening bookings without a signature
  - no cap

---

**B. A safeguarding dashboard with dials**
- **Where:** the top of `safeguarding-risk.html`, a **Dashboard** tab first, in the style of Martin's Calla Compliance dials. **I'll match the picture when it comes.**

**Who:** the site's lead and deputy, and the trustees (and master admins), as the register.

**The dials**, each with a big number, a red/amber/green arc and one line of words:

| Dial | What it counts (counts only) | Default green / amber (else red) |
|---|---|---|
| Leaders with in-date checks | leaders named on under-18 groups, teams and events with an in-date criminal record check **and** training, ÷ all of them | ≥ 95% / ≥ 85% |
| Sessions with enough leaders | Sunday group sessions in the last 8 weeks where leaders checked in met the ratio and two adults (`kidsLeaderIns` vs children in), ÷ sessions held | ≥ 95% / ≥ 85% |
| Children with a current consent form | registered children whose consent is in date, ÷ registered children | ≥ 95% / ≥ 85% |
| Risk assessments signed off | events in the next 60 days that need one and are signed, ÷ all that need one | 100% / ≥ 80% |
| The annual review | items done this year ÷ items | all done / under way and not overdue |
| Incidents awaiting follow-up | incidents with no follow-up recorded after 7 days (a **count**, lower is better) | 0 / 1–2 |

- **Thresholds** are in safeguarding settings (`safeguardingSettings/defaults.dials`), with these defaults.
- **Where the numbers come from:** the same server job as the warnings (`sgWarningsSync`) writes them to **`sgDashboard/{siteId}`** = `{ dials: { key: { value, of, pct, rag } }, at }`.
  - Counts only: never a name, a child, an incident's words, or a concern.
  - Read: the register's readers. Written by the server only.
  - **Concerns are not counted on any dial.** Only the lead reads concerns, and that stays as it is.

**Clicking a dial** opens what fixes it, for those allowed to see it:

| Dial | The lead or deputy goes to | A trustee sees |
|---|---|---|
| Checks | safeguarding.html's "DBS checks and training running out" | the breakdown by group, counts only, and "the safeguarding lead can see who" |
| Sessions | a new **Sessions** list on Tab C: group, date, children in, leaders in, needed (numbers, no names) | the same list |
| Consent | kids-admin.html's Children tab, filtered to missing or run out | counts per group |
| Assessments | Tab B | Tab B (read only) |
| Review | Tab D | Tab D |
| Incidents | safeguarding.html's incidents for the event | the count and dates only |

- **No dial links a trustee to a page that would refuse them:** where they can't see names, the dial opens a counts-only view.

**Checks for B**
- **Unit:** each dial's sum from invented data, at the edges of each threshold, and thresholds from settings.
- **Rules:** `sgDashboard` is read by the lead, deputy and trustees only, and written by the server only.
- **Browser:**
  - a trustee sees six dials with the right colours, **and no invented child's, leader's or incident's words anywhere on the page**
  - clicking each dial lands where the table says
  - the lead's checks dial goes red when an invented leader's check runs out, and green when it's renewed
  - 375 px and computer, with pictures
- **Breaks (planned):**
  - **The one that matters:** a name reaching `sgDashboard`
  - thresholds ignored
  - a trustee's dial linking to a page that refuses them
  - a dial counting concerns

---

**Additions to the earlier questions**
6. **The AI fallback:** turn on the server-side fallback to another Claude model when this one refuses (my default), or not?
7. **Who may ask for an AI draft:** the event's organiser and named leaders, and the lead and deputy (as planned), or only the lead and deputy?
8. **The caps:** 20 a day per church and 5 per person: right?
9. **The dials' style:** I'll wait for the picture of Calla Compliance's dials before building them.

### F-265, part B: the dials' style (Martin's Calla Compliance pictures), and the answers to 6–9 (the events window, 22 Oct)

**The mock-up** (invented numbers, not a page of the hub): `design-mocks/sg-dials/index.html`, with pictures `mock-desk.png` and `mock-375.png`.
- **The main view:** one large dial, **"Ready for the annual review"** (e.g. 75%, "6 of 8 items"), with:
  - **"Next, cheapest first"** cards beside it, each one line (the quickest things to close)
  - the date, "as at …"
  - the note *"This counts what is on file for this year's review. It is not a score for the church, and it says nothing about any child or any concern."*
  - a soft beige note for items that don't apply (*"not counted and not shown"*)
- **The row of smaller dials:**
  - leaders with in-date checks (DBS and training)
  - sessions with enough leaders (and two adults)
  - children with current consent
  - event assessments signed off
  - incident follow-ups open (counts only)
- **The legend under the row:** High, or blocked / Medium, or due / Low, or complete / On file, towards complete / Nothing recorded.
- **The dial:** a half-circle of **14 rounded blocks** with small gaps, filling left to right in proportion. A big light number in the middle (a percentage or a count), "22 of 28 leaders" small beneath it, then a title and one plain line.
- **Colour by meaning, not by amount**, in the hub's colours:
  - **red** `#b0392c`: high or blocked
  - **amber** `#b07d2e`: medium or due soon
  - **green** `#15803d`: complete or low
  - **slate blue** `#4b6a7d` (new; the hub has no slate): on file, towards complete
  - **pale beige** `#e4ded3`: not filled, or nothing recorded
  - A dial can be **split by meaning**, as Calla's "Risk across the portfolio": e.g. checks in date (slate), running out this month (amber), run out (red), the rest beige.
  - The thresholds in safeguarding settings decide which category each item falls in (e.g. "due soon" = within 6 weeks), not the dial's colour by amount.
- **"Could not be read" is never a zero:** a dash, a faded dial, "no figure", and a short red line saying why (*"Not a zero: no consent form is set up yet, so this could not be read"*). **"Nothing on file yet"** is an empty beige dial at 0, said in words.
- **Accessible:** the number and its line are real text, not part of the picture, so they're read aloud and stay readable at any width; the blocks are decoration. **Phone:** the row wraps to two across, the big dial stacks above "Next", and nothing scrolls sideways at 375 px (checked).

**Answers to 6–9 (the reviewing window, for Martin):**
6. **No fallback to another model.** A refusal is shown plainly: *"The AI couldn't draft this; write it from the template instead."* Retry only on overload or busy (same model, with backoff, a few times).
7. **The event's organiser and named leaders may ask for a draft,** as well as the lead and deputy. Only the lead or deputy signs off.
8. **20 a day per church and 5 per person,** as settings.
9. **The dial style is as above.**


**Not yet received:** the answers to 1–5. 4 is evidently yes (the sign-up gap fix is ordered).
## From the main window, 22 Oct 2026: a new stamp for egbc-share.js in egbc-events.js

- **egbc-share.js** changed: the Share sheet's message box was dark text on dark grey in the app's dark theme (the reviewing window). It is now kept light.
- **Please change** egbc-events.js:614, `egbc-share.js?v=202610212300`, to `?v=202610221610` (then regenerate public-mail-pages.cjs as usual).
- **Also, for the rota:** meeting.html's "New meeting" now offers every team's own meeting, e.g. "Kids Church Meeting" (the reviewing window: a Kids Church leader could not set one up). egbc-core-rota.js keeps a type it doesn't list instead of overwriting it. Nothing needed from you unless one of your pages lists meeting types.

### F-266 — Sign-ups: the database now checks the event is taking them (the gap found planning F-265; the events window, 22 Oct)

**The gap:**
- signup.html hid the Book button for an event that isn't taking sign-ups (`signupOn` false or missing) or is cancelled.
- But the rules never asked. A sign-up could still be written straight to the database while the event's capacity record existed.

**The fix:** `canSignUpTo()` (my events section) now also requires `signupsOpen(event)`: `signupOn == true` and the status not "cancelled".
- **One exception:** the event's own team (`runsEventId`) may still add someone. That's how check-in adds a walk-in at the door, even when online booking is closed.
- **Later:** the safeguarding sign-off gate (F-265, step 2) will add to the same function.

**Proved:**
- **Rules: 1769/1769,** with six new checks:
  - a sign-up to an event taking them goes through
  - refused when the event isn't taking sign-ups, never said it does, or is cancelled
  - a member not on the team: also refused
  - **the team's walk-in at the door is still allowed**
- **One of my own older checks** used an event that never said it takes sign-ups. It now says it does (its point was who may sign up, not whether).
- **Breaks, 3 of 3 caught:**
  - **The one that matters:** sign-ups taken whatever the event says.
  - A cancelled event still taking them.
  - The team's walk-in refused.
- **Pages that make sign-ups, one at a time:**

  | Test | Result |
  |---|---|
  | e1-checkin (walk-ins) | 52/52 |
  | who-can-come | 15/15 |
  | series | 15/15 |
  | pay-on-day | 18/18 |
  | usual-people | 37/37 |

**Found, not mine (for the main window):** `public-mail.test.mjs` is 40/45. B1/B2 send to an invented address through the mail sender, and `functions/mail-route.js` now refuses it ("Recipient not known to the hub"). That's from the hubSend change; no rules are involved, and it fails the same without this fix.

**Deploy:** nothing. The rules go live when the hub does.

### F-267 — Present in a meeting: the sheet's look, plain words, and leaving that always stops (the events window, 22 Oct)

**1. The sheet looked broken** (the reviewing window: Close faded inside a white bar).
- **The cause:** the sheet used ordinary class names, `row` and `msg`, that meeting.html styles for its own page:
  - `.row` is a white bordered box
  - `.msg` is a full-size overlay that would have covered the sheet whenever it showed a message
- **The fix:** every class in the sheet now has its own `pz-` name.
- **Also fixed:** on a phone the text boxes ran past the sheet's edge. The sheet isn't inside the engine's `.pz` block, so it lacked `box-sizing`; it has its own now.
- **Why the tests missed it:** the stand-in page didn't carry meeting.html's styles. It now **reads meeting.html's own `<style>` as it loads**, so any future clash shows up there too.
- **New checks,** at computer and phone size, with the sheet open, both before go-live and with slides, add and people:
  - the panel is dark
  - no row in it is white
  - Close is clear, not faded, and 44 px tall
  - the status line isn't an overlay
  - **nothing inside sticks out past the panel**
  - it's all on screen
  - nothing scrolls sideways
- **Pictures:** `meeting-sheet-held-desk.png`, `-375.png`, `meeting-sheet-host-desk.png`, `-375.png`.

**2. Plain words:** "You can add slides when the hub goes live." (the sheet), and "You can add PowerPoint slides when the hub goes live." (the session planner). There's no more "storage is not yet private"; the tests check those words are gone.

**3. Leaving the meeting now always stops the presenting,** found while testing 1.
- The page sent the stop through the database library, which sends writes a moment later; **a closing page is gone first.** Yesterday's passes were luck in that race.
- **Tried and not enough:**
  - a single commit
  - a request that outlives the page (`fetch` keepalive): it carries a sign-in header to another address, so the browser must ask permission first, and a closing page can't
- **What works:** a **beacon** (`navigator.sendBeacon`: plain text, no permission step) to a new small function, **`presentLeave`**.
  - It checks the sign-in token itself, then does **only what that person may do anyway:** stop their own presenting, take back the say-so they gave (stopping that person's presenting), and remove their own "who is here".
  - The library's write stays as a second try.
  - The sign-in token is kept fresh in advance, because there's no time to get one while closing.
- **Also fixed:**
  - "who is here" is now deleted on its own, so a missing record can't sink the stop; its rule accepts deleting one that's already gone
  - "present this deck" is no longer dropped when the same deck is already showing, or still loading, as a viewer (the cause of yesterday's one-off timing red); the engine gained `start()`

**Proved, one test at a time, more than 3 GB free:**
- **Rule Zero:**

  | Test | Result |
  |---|---|
  | present-meeting | 58/58, twice, and once more after the last fix |
  | present | 55/55 |
  | present-quiz | 39/39 |
  | rules | 1769/1769 |

- **Breaks, 2 of 2 caught:**
  - the sheet's row named `row` again (the white bar: the look checks fail at both sizes)
  - no box-sizing (the full sheet fails at both sizes)
- **Leaving, before the beacon:** section 6 ("she leaves while presenting: it stops") failed 3 times out of 3. With the beacon it passes every time.

**Deploy:**
- **The reviewer:** the new function `presentLeave` (HTTPS, public invoker; it checks the sign-in itself). **No secret.** The page change goes live with the push.
- **The main window:** please bump meeting.html to `egbc-present.js?v=202610221330`.
- **The main window, later:** egbc-auth.js could share its functions address (`FUNCTIONS_BASE`); the hook works it out the same way meanwhile.

### F-268 — The safeguarding risk register, step 1: standing risks (F-265; the events window, 22 Oct)

**Built:**
- **A new page, `safeguarding-risk.html` ("Safeguarding risks"),** with the **Standing risks** tab. The other tabs come with their steps.
- **Activities:** the site's safeguarding lead (or deputy) adds them from **the hub's own groups at that site**, one tap each. These are:
  - Sunday groups (`kidsGroups`)
  - children's and youth planner groups
  - under-18s small groups

  Each one is read only if the lead may read it. They can also add any other activity by kind: transport, pastoral visits, online and livestream, lone working, hirers working with children, clubs.
- **Each risk:**
  - what could happen and to whom, in general words
  - likelihood × impact, before and after its controls, **shown in words and colour** ("Before: High 20", "After: Medium 12"); the same bands as risk.html (15+ high, 5+ medium)
  - its controls: one the hub watches (marked ◉; they'll turn the risk amber by themselves in step 3) or written words
  - an owner, a role in words ("the Juniors leader")
  - a review date: "Review overdue" when it's past
- **Sorted** by how bad it is after its controls.
- **Closing a risk** keeps it under "Closed (n)". Nothing is deleted.
- **The starter list**, `egbc-sg-templates.js`, is written in our own plain words for any church: no church's name, team names or any body's wording. It covers Sunday groups, youth groups, clubs, online and livestream, pastoral visits, transport, lone working and hirers. A starter already added is marked and can't be added twice. The editor says, every time: *"General words only: never name a child, a family or a concern."*
- **Who:**
  - the site's lead and deputy keep it
  - **the trustees** (`safeguardingSettings/defaults.trusteeTeam`, set on Safeguarding settings, "Elders" unless set) and master admins read it, read-only
  - everyone else, an activity's own leaders included, is told it's for the lead, deputy and trustees, and the database refuses them too
- **The ways in:** a "Safeguarding risk register" button on safeguarding.html (for the lead, deputy and master admins), and a line on the Live risk register for the trustees.

**Rules (my events section; live when the hub goes live):**
- **`sgRegSees(siteId)`:** master, `sgLeadOf(siteId)`, or `onTeam(trustee team from the setting)`.
- **`sgActivities` and `sgRisks`:** written only by the site's lead or deputy, in their own name, never deleted.
- **Fixed shapes (`hasOnly`)** leave no field for a child, a concern, an incident's people or a medical detail:
  - words have length limits
  - ratings are 1–5
  - reviews are dates
  - a risk must belong to an activity at the same site
- **One limit, said plainly:** the rules can cap a risk's controls at 20, but can't check each control's length (they can't look inside a list). The page holds each to 200 characters.
- **Safeguarding settings** may also hold `trusteeTeam` (60 characters at most) and `register` (a map, for the register's later settings).

**Proved:**
- **Tests:**

  | Test | Result |
  |---|---|
  | rules suite | 1794/1794, 25 new checks |
  | sg-register-unit (no emulator) | 11/11 |
  | sg-register (browser) | 25/25 |

  - **The rules checks:**
    - the lead and the deputy write
    - an extra field is refused
    - another site, another name and bad ratings, lengths and dates are refused
    - nothing is deleted
    - trustees and master admins read but don't write
    - **an activity's own leader, signed-out people and another site's lead can't read it**
    - **switching the trustee team to "Trustees" flips who reads**
  - **The unit test:** the rating bands, and every starter fits the rules' shape; after its controls a risk is never worse; no church's or body's names; no medical words.
  - **The browser test:**
    - the lead adds a group from the hub and another by kind
    - adds 5 starters, adapts one and closes one
    - the words-and-colour rating and "Review overdue" show
    - the trustee and master admin are read-only, and a volunteer is refused (page and database)
    - the trustee setting saves (keeping the lead and the rest) and takes effect
    - the way in from Safeguarding works
    - nothing scrolls sideways at 375 px or on a computer
  - **Pictures:** `sg-register-lead-desk.png`, `sg-register-lead-375.png`, `sg-register-trustee-desk.png`.
- **Found and fixed on the way:** an unescaped apostrophe in my new settings card stopped Safeguarding settings loading at all. The browser test caught it.
- **Breaks, 6 of 6 caught:**
  - **The one that matters:** a risk accepting any field (a child's name, a concern) is refused by the rules.
  - any active member reading the register
  - the trustees able to change it
  - the trustee setting ignored
  - the rating bands wrong (12 as high)
  - the page letting a trustee edit

**For the main window:**
1. **A Menu entry,** "Safeguarding risks" (`safeguarding-risk.html`), beside Safeguarding, for the lead and deputy, master admins **and the trustee team**. The trustees need a new gate in `egbc-menu.js` (the existing `sg:` is admins or leads only), reading `safeguardingSettings/defaults.trusteeTeam`. Until then the trustees reach it from the Live risk register.
2. **An add-on switch** in your `FEATURES` lists and the rules' key list, as planned: "Safeguarding risk register" (`safeguardingRegister`), off by default, on at EGBC. Until it exists, the page follows the existing `safeguarding` switch.

**Deploy:** nothing. There are no functions in this step, and the rules go live when the hub does.

### F-269 — The safeguarding risk register, step 2: event assessments, signed off before bookings open (F-265; the events window, 22 Oct)

**Built** (Martin's answer 2: automatic for under-18s trips, overnights, holiday clubs and off-site events; only the lead, deputy or a master admin can untick it, recorded):
- **events-admin.html:** beside "Works with under-18s", a new **"What kind of event is it? (for safeguarding)"**: a usual session, club or event; a trip; an overnight or sleepover; a holiday club; off-site. It's saved as `calEvents.sgKind`.
  - An under-18s event of the last four kinds **waits for safeguarding sign-off**, and the save message says so.
  - The kind is the admin's to set, like the under-18 tick.
- **The assessment** (`egbc-sg-assess.js`), on the event's own safeguarding page (safeguarding.html?event=):
  - **Who writes it:** the event's team and its named leaders, starting from the **trip, overnight, holiday club or off-site template**. Each template has its questions in general words and its starter risks, adapted.
  - **Statuses:** "Being written", "Ready for sign-off", then **signed off by the site's lead or deputy only**, with the time and the version.
  - **A risk still high after its controls** needs the signer's typed reason.
  - **Any change after signing** takes it back to waiting (a new version), and bookings close again.
  - **"Not needed for this event?"** is for the lead, deputy or a master admin only, with a reason, recording who, when and why. Nobody can change or undo it afterwards.
  - **Print:** a print button for taking it on the trip.
- **The register's new Tab B, "Event assessments":** this site's coming events that need one, with where each has got.
  - The lead opens each on the event's page.
  - Trustees and master admins read it in place, read-only.
- **The public sign-up page** says **"Bookings open after safeguarding sign-off"** with no form, until it's signed.

**Rules (my events section; live when the hub goes live):**
- **`canSignUpTo()`:** for an under-18s event (`eventLeaders.under18`) whose `sgKind` is one of the four, it now also requires `sgAssessments/{event}` to be signed or waived. That covers everyone, the team's walk-ins included.
- **`sgAssessments/{event}`:**
  - fixed fields, no field for a child or a concern
  - the site must be the event's
  - written by the lead or deputy, the event's team or its named leaders
  - **"signed"** only by the site's lead or deputy, as themselves, at the server's time, for that version
  - **a change can't stay "signed"**
  - **"waived"** only by the lead, deputy or a master admin, with a reason, at the server's time; its who and why are fixed after
  - never deleted
- **`sgGate/{event}`:** public, **only `needed` and `open`**. "Open" must match a signed or waived assessment saved with it (`getAfter`).
- **Found and fixed on the way:**
  - reading an assessment that isn't written yet was refused (the rule judged a missing document's site), so the "not needed" box never showed; now a missing one can be found missing
  - the organiser could change the recorded "not needed" reason; now its who and why are fixed

**Proved:**
- **Tests:**

  | Test | Result |
  |---|---|
  | rules suite | 1822/1822, 28 new checks |
  | sg-register-unit | 16/16, with the four event templates |
  | sg-assess (browser) | 23/23 |

  - **The rules checks:**
    - an under-18s trip refuses sign-ups until signed
    - an adults' trip and a usual club don't wait
    - the team and the leaders write it; a volunteer and trustees can't
    - an extra field or the wrong site is refused
    - **the organiser can't sign; the lead can't sign in another's name or at a made-up time**
    - the gate can't say "open" early
    - after signing, a sign-up goes through
    - **a change can't stay signed, and bookings close again**
    - "not needed": not by the organiser, not without a reason; the lead with a reason opens it, and it can't be changed after
    - nothing is deleted
  - **The browser test:**
    - the organiser sets "a trip" and the waiting gate is made
    - **the guest's page says it waits, and the database refuses a sign-up anyway**
    - a named leader writes it from the template, with no "Sign it off" for them
    - **the lead must give a reason for a high risk, then signs, and a guest books**
    - a change goes back to waiting and bookings close
    - the lead waives another event, recorded
    - a trustee reads Tab B, read-only
    - 375 px
  - **Pictures:** `sg-assess-lead-375.png`, `sg-assess-trustee-desk.png`.
- **Breaks, 7 of 7 caught:**
  - **The one that matters:** sign-ups not held back by the sign-off.
  - the organiser able to sign
  - a change staying signed
  - the organiser able to waive
  - the gate saying open with nothing signed
  - the page signing a high risk with no reason
  - events-admin not saving the kind
- **Rule Zero, the pages I touched, one at a time:**

  | Test | Result |
  |---|---|
  | e3-safeguarding | 38/38 |
  | event-team | 21/21 |
  | who-can-come | 15/15 |
  | series | 15/15 |
  | pay-on-day | 18/18 |
  | sg-register | 25/25 |

**Not done here:** the What's on cards and the app don't say "waiting for sign-off" yet; the sign-up page does, and the database holds bookings either way. If wanted, that's a later step.

**Deploy:** nothing. There are no functions in this step, and the rules go live when the hub does.

### F-270 — "Waiting for safeguarding sign-off" on What's On, the app and the website embed (the reviewing window: the pages must hold bookings until the rules are live; the events window, 22 Oct)

**Why:** the database's refusal (F-269) only bites once the rules go live. Until then the pages must hold bookings themselves, and they were saying "Sign up" for an under-18s trip still waiting for sign-off.

**Built:**
- **One shared check, `EGBCEvents.sgWaiting(events)`.** It reads the public `sgGate` of only the events that could need one (a trip, overnight, holiday club or off-site), and gives `{ eventId: true }` for those waiting. The words are `EGBCEvents.SG_WORDS`: "Bookings open after safeguarding sign-off".
- **What's On (whatson.html):** the card says **"Bookings open after safeguarding sign-off"**, with no "places left" or "waiting list". Its link goes to the event page, which shows the same words and no form (F-269).
- **The app's What's On:**
  - the list shows **"Not open yet"** in place of "Sign up"
  - the event view shows **"Bookings open after safeguarding sign-off · Not open for booking yet"** with no Sign up row
- **The church website's embed (whatson-embed.html):** the same words in place of "Sign up".
- **Once signed off (or "not needed"),** all three show "Sign up" again.
- **An old copy of egbc-events.js still cached** in a browser can't break these pages: they check the helper is there first.

**Proved:**
- **sg-assess.test.mjs: 28/28.** New checks while it's waiting:
  - What's On's card says it, with no places
  - the embed says it, with no "Sign up"
  - the app's list says "Not open yet", and its event view says it with no Sign up
  - after signing, the embed says "Sign up" again
- **Breaks, 2 of 2 caught:**
  - **The one that matters:** What's On showing places to book while waiting.
  - The app offering Sign up while waiting.
- **Rule Zero:**

  | Test | Result |
  |---|---|
  | app-whatson | 15/15 |
  | public-whatson | 24/24 |

**For the main window:** app.html loads `egbc-events.js?v=202610221300` and `egbc-app-whatson.js?v=202610152300`. Please bump them to `egbc-events.js?v=202610221700` and `egbc-app-whatson.js?v=202610221700`, so the app's phones fetch the new code. My pages are bumped.

**Deploy:** nothing.

### F-271 — The safeguarding risk register, step 3: live warnings and the email two days before (F-265; Martin's answer 5; the events window, 22 Oct)

**Why:** a register that only says what *should* happen isn't enough. The lead needs to know, without hunting, when a control has slipped: too few adults this morning, a trip short of leaders, a check run out, a consent form missing.

**Built:**
- **The server works the warnings out** (functions/sg-warnings.js, with the sums in functions/sg-warnings-core.cjs). It reads what the hub already holds and writes `sgWarnings/{siteId}`: **counts, dates and a link only**. Never a child, a leader, a concern or a medical detail. It looks at:
  - **Sunday groups this morning:** children checked in against leaders checked in. Fewer than 2 adults is red; short of the group's ratio is amber.
  - **Under-18s events in the next 14 days:** fewer than 2 named leaders, or short of the ratio, is amber, and red within 2 days. A trip, overnight, holiday club or off-site event not signed off is amber, and red within 7 days.
  - **Leaders' checks** on under-18s groups and events: run out is red; running out within 6 weeks (the register's "due soon" setting) is amber.
  - **Consent forms**, per group: missing or run out is red; running out soon is amber.
  - **The register's own risks** past their review date: amber.
- **When:**
  - every 15 minutes (`sgWarningsSync`)
  - at once with **"Refresh now"** (`sgWarningsNow`), for the site's lead, deputy, a trustee or a master admin
  - off with the safeguarding switch
- **The register page (safeguarding-risk.html):**
  - a third tab, **"Warnings (n)"**: worst first, each with "Act now" or "Soon", what to do, and (for the lead and deputy only) "Go to it". A trustee sees the same counts but no link into pages that show names.
  - on the first tab, a standing risk whose control has slipped says **"A control has slipped: see Warnings"** in red or amber.
- **The email two days before** (`sgTwoAdultsDaily`, 08:00 London). A session two days on still short of two adults, or of the ratio, emails the site's lead and deputy. **Once only:** each email is recorded in `sgMailed`, so the next morning doesn't send it again. There are no names in it, just the session, the counts, what to do and a link.
- **Rules:**
  - `sgWarnings`: read by the site's lead, deputy, the trustees and master admins. Only the server writes it.
  - `sgMailed`: the server's alone.
- **No new secret or setting.**

**Proved:**
- **sg-warnings-unit.test.mjs: 29/29** (no emulator). Covers each kind of warning, the levels, the order, the Sunday-group weekday (7 is Sunday), the email's "once", and no names even when names are in what it's given.
- **sg-warnings.test.mjs: 30/30**, with the functions emulator:
  - the server's warnings
  - the lead's tab and the marked risk
  - a trustee: no names, no links
  - a volunteer refused by the database and the server
  - "Refresh now" clearing a warning once a second leader checks in
  - the email: lead and deputy, once, no names
  - 375px and computer pictures
- **Rules: 1834/1834** (12 new).
- **Breaks, 10 of 10 caught:**
  - **The one that matters:** a leader named in a warning (the browser test, 3 checks, and the unit test).
  - One adult with a group let pass.
  - An event short of the ratio not flagged.
  - A Sunday group never matched to a Sunday.
  - The email sent every morning.
  - A slipped control not marking its risk.
  - A trustee given "Go to it".
  - The server letting a volunteer refresh.
  - The database letting any member read the warnings.

**Found and not fixed:**
- The hub doesn't hold who is due at a Sunday group on a given date ahead of time. So the email two days before judges a Sunday group by its **regular** leaders. On the day itself, the warning uses who actually checked in.

**Deploy (the reviewing window):** `sgWarningsSync`, `sgWarningsNow`, `sgTwoAdultsDaily`. No new secret. The rules go live when the hub goes live.

## From the main window, 22 Oct 2026: multi-church step 3 in your functions (batch 7, via the reviewing window)

Every function must take the church from the sign-in's claim or the document's path, never from the page. EGBC (no claim) keeps working exactly as today. The full rules are under H-5 in FINDINGS-churchhq.md. Please change these; I won't touch your files.

- **Callables:** presentConvert, presentFromLink, quizStart/Open/Reveal/Phase/Kick/End, paymentsSave/Remove/Team, ticketPay, paymentCheck, paymentCheckEvent, giveRegularly, givingChange, givingStop, lessonFor, planSend, bibleKeySave/Status, bibleFetch, m365Start/Status/Disconnect, myEventsFeed, emailMyFeedLink, commsReport, myMessages, teamMailMine, teamMailSave, sendAsTeam.
  - Use `churchOf(request, getFirestore()).db` from `functions/church-scope.js` in place of `getFirestore()`, and pass it on.
  - It refuses a church not in the claim, and asks "which church?" when there are two.
- **Triggers:** cateringSync, kidsCountsKeep, peepTodayOn*, prayerSundayOnPrayer/OnRota, sermonLinkKeep, and publicMail* (Comms' send, your triggers).
  - Keep each as it is, and add a twin on `churches/{cid}/<same path>`, named `<name>Church`, that gets its db from `churchFromPath(event, db)`.
  - index.js `twins()` is the pattern.
- **Scheduled jobs:** checklistReminders, complianceDaily, paymentsTidy, peepTodayDaily, prayerSundayDaily, presentSweep, quizSweep, arrivalCheck.
  - Wrap the body in `eachChurch(db, (ch) => run(ch.db))`. It runs EGBC first, then each active church, and fails the run if any church failed.
- **Codes and links with no sign-in:**
  - Quiz codes (quizJoin, quizAnswer), eventsFeed keys, and payment/webhook references (gocardlessWebhook, stripeWebhook).
  - After a church writes one, call `indexCode(db, kind, hash)` from `functions/hq-codes.js`. The endpoint uses `dbForCode(root, kind, hash)`; no entry means EGBC.
  - Add your kinds to `KINDS` in hq-codes.js. That one line in my file is fine; tell me which.
  - Webhooks: put the churchId in the payment's metadata when you create it, and look it up with `dbForCode`. Never take a church id the caller sent.
- **The check:** extend `tests/check-church-calls.mjs`, or copy its pattern. For each function:
  - Ann, in mc-alpha, gets alpha's answer;
  - naming beta, or giving beta's ids, is refused or finds nothing, and nothing is written in beta;
  - Eve, with no claim, gets EGBC's answer as today;
  - a break (the helper bypassed) turns it red.
  - Run it on the spare emulators: `FUNCTIONS_EMULATOR_PORT=5191`, `--config firebase.spare.json --only firestore,auth,functions`.

## From the main window, 22 Oct 2026: EGBCAuth.functionUrl(name) for the leave beacon

- **egbc-auth.js now has `EGBCAuth.functionUrl(name)`** (the reviewing window asked for it). It is the same address `EGBCAuth.call()` posts to: the emulator's on the emulator, the live one otherwise.
- **Please use it in egbc-present.js** `leaveUrl()` in place of working the address out again. Keep your own as the fallback while a page may have the old egbc-auth.js:
  `return EGBCAuth.functionUrl ? EGBCAuth.functionUrl('presentLeave') : <yours>;`
- **Stamps:** meeting.html loads `egbc-auth.js?v=202610221800`. present.html will want the same when you switch.
- **Checked by:** tests/check-function-url.mjs, 4/4. A break (the address worked out separately, wrongly) turns 3 red.

### F-272 — The safeguarding risk register, step 4: the dials (Calla style), the church-wide annual review and the trustees' snapshots (F-265 part B and part 4; the events window, 22 Oct)

**Built:**
- **The server works out six dials** for each site in the same 15-minute run as the warnings (`sgWarningsSync`, and "Refresh now"). It writes them to `sgDashboard/{siteId}`, **counts only**:
  - **leaders with in-date checks:** a DBS check and training; running out within the "due soon" weeks is shown apart
  - **sessions with enough leaders, and two adults,** over the last 8 weeks. Check-ins are read by date, and leader check-ins by record name, so **no new index** is needed. The 8 weeks before today are read once a day and kept; today's are read every time.
  - **children with a current consent form**
  - **event assessments signed off**, for the next 60 days
  - **the annual review**
  - **incident follow-ups open:** this year's incidents with no follow-up after 7 days. Only each incident's date and whether it has a follow-up are read. **Concerns are never read or counted.**
  - Each dial is red, amber or green against thresholds that are **settings**.
  - **"Nothing on file yet"** is an empty dial at 0, said in words.
  - **"Could not be read"** is never a zero: it shows a dash, "no figure", and a short line saying why.
- **The register page opens on a new Dashboard tab** (egbc-sg-dash.js), as in the mock-up:
  - **The big dial, "Ready for the annual review":**
    - **"Next, cheapest first"** beside it
    - the note *"It is not a score for the church…"*
    - a beige note for items that don't apply
  - **Five smaller dials:** half-circles of 14 blocks, coloured by meaning, with the number and its line as real text.
  - **Clicking a dial:**
    - **The lead or deputy** goes to the page that has the names: checks to Safeguarding, consent to Kids admin, incidents to Safeguarding.
    - **A trustee or master admin** gets the counts in a sheet instead ("The safeguarding lead can see who"). They are never sent to a page that would refuse them.
    - **For everyone:** sessions open a new numbers-only "Sessions, the last 8 weeks" list on Warnings; assessments open Tab B; the review opens Tab D.
  - `safeguarding-risk.html?tab=risks` (or any tab) opens that tab.
- **Tab D, the annual review, church-wide** (Martin's answer 3):
  - **Eight items, cheapest first,** in `REVIEW_ITEMS`; the unit test checks the page's list matches the server's.
  - **Each is recorded once**, with who, when and an optional note, as `sgReviews/<year>_<item>`. **It is never changed or removed.**
  - **Who records what:**
    - any site's lead or deputy records the lead's items, naming their site
    - the trustees record theirs (the policy adopted; their training)
    - either records the annual return
  - **Only the two optional items** (hirers; the annual return) can be marked "does not apply"; they are then not counted.
  - **Overdue** a year after last year's review.
- **Tab E, snapshots:**
  - Taken by the trustees and master admins, and read by the lead and deputy.
  - **Each holds:** the risks with their ratings, the dials, the warnings counts and the review, under the banner **"Safeguarding risk register: <site>, <date>"**.
  - **Never changed.** There's a Print button.
- **Safeguarding settings:**
  - "Due soon" in weeks
  - each dial's green and amber thresholds (defaults: 95/85 %, assessments 100/80 %, incidents 0/2)
- **Rules:**
  - `sgDashboard`: read by those who read the register; only the server writes it.
  - `sgReviews`: create only, as above; read by master, the trustees, the lead site's lead and deputy, and the recording site's.
  - `sgSnapshots`: create only, by trustees or master, with the banner.
- Also, main's request: `egbc-share.js?v=202610221610` in egbc-events.js, and public-mail-pages.cjs regenerated (d0dc56ec).

**Proved:**
- **sg-dash.test.mjs: 45/45**, with the functions emulator:
  - the server's dials from invented data
  - **no child's, leader's or incident's words, and no concern**, on the server's record and on both people's pages (five invented concerns on file)
  - the lead's dashboard
  - where each dial goes, for the lead and for a trustee
  - the review: the lead's items, "does not apply", the trustee's item, and the big dial following through "Refresh"
  - thresholds lowered on Safeguarding settings, turning the checks dial green
  - a renewed check turning it green
  - a trustee's snapshot, read by the lead
  - pictures at 375 px and computer size, with no sideways scrolling
- **sg-warnings-unit.test.mjs: 53/53** (24 new). Each dial at its threshold's edges, thresholds from settings, "nothing on file", "could not be read", two adults, the review's status, and the two item lists matching.
- **Rules: 1872/1872** (38 new).
- **Breaks, 11 of 11 caught:**
  - **The one that matters:** an incident's people reaching the dials (caught by the browser test and the unit test).
  - Thresholds ignored.
  - A trustee's dial sending them to a page that would refuse them.
  - A dial counting concerns.
  - "Could not be read" shown as a zero.
  - One adult counted as enough.
  - A "does not apply" item still counted.
  - A review record changed afterwards.
  - The lead recording the trustees' items.
  - A snapshot without the banner.
- **Rule Zero:**

  | Test | Result |
  |---|---|
  | sg-register | 25/25 |
  | sg-assess | 28/28 |
  | sg-warnings | 30/30 |
  | e3-settings | 21/21 |
  | sg-lead | 14/14 |
  | e3-safeguarding | 38/38 |
  | functions-secrets | 5/5 |
  | sg-register-unit | 16/16 |

**Found and not fixed:**
- **The "hirers with children" warning** (in the plan's table) isn't built yet. The review's hirers item covers it for now.
- **A lead at another site** sees an item recorded by the lead site's lead as "Done (recorded at another site)", without who or when. The rules can't check "is a lead somewhere".
- **A snapshot keeps each risk's owner** as typed: a role, or a leader's name. Never a child.

**Deploy:** functions `sgWarningsSync` and `sgWarningsNow` again (they now write the dials). No new function, no new secret. The rules go live when the hub goes live.

## From the main window, 22 Oct 2026: the safeguardingRegister switch exists (your F-268, request 2)

- **The switch:** "Safeguarding risk register" (`safeguardingRegister`) is in both FEATURES lists and in the rules' list of names Church settings may save.
  - It is on by default; the reviewing window chose on rather than off.
  - The Menu's "Safeguarding risks" now follows it.
- **Please switch safeguarding-risk.html:335** from `EGBCAuth.uses('safeguarding')` to `uses('safeguardingRegister')`, along with anything else of yours that gates the register.
- **Checked by:** check-features-agree, now 20 checks. It includes "every switch can be saved", and a break with the switch left out of the rules' list turns it red.

### F-273 — Present: the leave beacon uses main's EGBCAuth.functionUrl (main's request, 22 Oct; the events window)

- **egbc-present.js** `leaveUrl()` now returns `EGBCAuth.functionUrl('presentLeave')`. Its own address stays as the fallback while a page may have the old egbc-auth.js.
- **present.html** loads `egbc-present.js?v=202610222000`.
- **For the main window:** meeting.html loads `egbc-present.js?v=202610221330`. Please bump it to `?v=202610222000`.
- **Proved:**
  - **present-meeting.test.mjs: 58/58.**
  - **Break caught:** the beacon sent to the wrong address turned 3 checks red. Leaving while presenting didn't stop, and the host's say-so didn't end when they left.
- **Deploy:** nothing.

## From the main window, 22 Oct 2026: the emulators now load firestore.build.rules (FINDINGS-churchhq H-7)

- **Why:** firestore.rules is 341 KB, and Firebase refuses a ruleset over 256 KB. The deployed ruleset is now built from it with the comments and spare whitespace taken out: `firestore.build.rules`, 177 KB.
- **Keep editing firestore.rules,** comments and all. After any rules change, run `node tools/rules-build.mjs` from v2.
- **Every config now names the built file:** firebase.json, firebase.spare.json, firebase.events.json (yours; the reviewing window asked me to change it), firebase.ease.json and firebase.tmp.json.
  - If you forget the build, your emulator tests run the old rules.
  - `tests/check-rules-build.mjs` fails when the built file is out of date, too big (over 230 KB), or not the same rules.
- **Your rules-engine tests:** any test that passes `fs.readFileSync('firestore.rules')` to initializeTestEnvironment should load `cfg.firestore.rules` instead, from the config it already reads. I've changed firestore-rules.test.mjs, church-scope-rules.test.mjs and storage-rules.test.mjs.
  - **Comms:** tests/check-enews-rules.mjs loads firestore.rules.
  - Static checks that read the source text, such as check-access-levels, can stay as they are.

### F-274 — The safeguarding risk register, step 5: AI-drafted event assessments (F-265 part A; Martin's answers 6–8; the events window, 22 Oct)

**Built:**
- **"Describe the event, and get a first draft"** on an under-18s trip, overnight, holiday club or off-site event's assessment (egbc-sg-assess.js, on the event's safeguarding page).
  - **Who:** the event's organiser (its team, or the admin who made it), its named leaders, and its site's lead and deputy. Volunteers not on the event and trustees are refused by the server.
  - **Above the box:** "Don't put in any child's name, anyone's contact details or anyone's medical details…".
  - **Below it:** "Sent to Anthropic's Claude to draft; not kept by the hub."
  - The box takes up to 4,000 characters, and optionally how many children are under 8.
  - **Before anyone types,** `sgAiStatus` says whether it's ready, not set up ("AI drafting isn't set up yet for this church. Write the assessment from a template instead."), at today's limit, or turned off.
- **The server: `sgDraftAssessment`** (functions/sg-ai.js; the parts with no network are in sg-ai-core.cjs).
  1. **Refused before anything is sent:**
     - a child's or parent's name the hub holds for the event (from its sign-ups)
     - an email, a phone number, a postcode, a date of birth, an NHS-style number

     A medical word next to a capitalised name asks first ("It's in general words: draft it").
  2. **The counts the hub knows, and nothing else, go with the leader's words:**
     - children booked, counted as the page counts them (one per attendee)
     - under-8s, if given
     - leaders named, and how many are cleared
     - the church's ratios
  3. **The model** is `claude-sonnet-5-5`, through the official SDK `@anthropic-ai/sdk`.
     - The answer's shape is fixed by structured outputs.
     - The fixed instructions are marked for caching.
     - `max_tokens` is 16,000, with a 120-second time-out.
     - **Only "busy" or "overloaded" is tried again** (429 or 5xx): the same model, up to 3 times, with backoff.
     - **No other model.** A refusal says, in Martin's words: "The AI couldn't draft this; write it from the template instead."
  4. **The hub's sums, never the AI's:**
     - Every rating is checked as 1 to 5, and every hazard needs a control and an owner given as a role. Anything malformed: "The draft came back incomplete; try again", and nothing is saved.
     - The overall is the worst rating after the controls, and red while anything must not go ahead.
     - When leaders are short for the ratio or two adults, the hub adds its own row first: "Not enough leaders: N needed for C children; L named". It's red, marked "must not go ahead", and labelled "From the hub's numbers".
  5. **Saved as a draft,** with `source: { kind: 'ai', model, at, by, overall, mustNot, questions, summary }`.
     - The gate stays "waiting", so **bookings stay closed.**
     - **The leader's words are not kept.**
     - A signed (or "not needed") assessment isn't redrafted.
  6. **Logged** in `sgAiLog`: who, when, how many characters, the outcome and the tokens. **Never the words.** Read by master admins and the site's lead and deputy; written by the server only.
  7. **Capped:** 20 a day for the church and 5 a person, counted in a transaction (`sgAiUse/<day>`). Both caps are on Safeguarding settings.
- **On the page:**
  - "First draft by AI: check every line. It counts for nothing until the safeguarding lead or deputy signs it off."
  - "Overall, by the hub's sums".
  - A red box: "This must not go ahead as described", with the plain sentences.
  - "Questions to answer before sign-off".
  - Each risk is tagged "Must not go ahead as described", "From the hub's numbers" or "AI draft".
  - **The lead can't sign while a "must not go ahead" item is there.** It has to be changed (its words, or no longer high after the controls) or taken out.
- **The secret:** `CHQ_ANTHROPIC_API_KEY` (defineSecret), declared by both callables. functions-secrets.test.mjs now checks sg-ai.js and sg-warnings.js.
- **On the emulator only,** the function talks to a local stand-in (`sgAiStub/config`, server-only), never the real API.
- **The register's own switch** (main's request after F-272): safeguarding-risk.html, the warnings, the dials, the two-adults email and AI drafting now follow `safeguardingRegister` as well as `safeguarding`.
- **Found while testing, and fixed:** the warnings counted a booking's `places`, while the event's own pages count one per attendee (`EGBCCheckin.people`). Both the warnings and the AI facts now count as the pages do, and a check holds them together.

**Proved:**
- **sg-ai.test.mjs: 46/46**, with the functions emulator and the stand-in. No real call. It covers:
  - not set up: the plain message, and nothing sent
  - **a child's name from the sign-ups, an email and a phone number refused, with nothing sent**
  - the medical warning
  - **a draft:**
    - the label; the hub's overall (High) where the AI said green
    - the hub's own row; the "must not go ahead" box; the questions
    - the page's own count agreeing (12)
    - the leader's words not kept
    - the gate closed
    - **what was sent: the model, the fixed shape, the cached instructions, the counts and the words, and no child's, parent's or leader's name or email**
    - the log, without the words
  - the lead unable to sign until the "must not go ahead" items are taken out, then signing with a reason
  - no redraft once signed
  - a refusal: Martin's words, one call, no other model, nothing saved
  - malformed: nothing saved
  - busy: tried again, then drafted
  - a volunteer and a trustee refused; the named leader allowed
  - both caps, and the counting
  - the register switched off
  - pictures at 375 px and computer size
- **sg-ai-unit.test.mjs: 38/38:** the personal checks, the hub's row (and the under-8 test), re-scoring both ways, malformed answers, the 40-risk shape, what is sent, the schema closed, the caps.
- **Rules: 1882/1882** (10 new).
- **Breaks, 13 of 13 caught:**
  - **The one that matters:** the AI's own red/amber/green trusted (caught by the browser test and the unit test).
  - A child's name passing the check (browser and unit).
  - The leader's words kept in the log.
  - The ratio shortfall left to the AI (browser and unit).
  - A draft opening bookings.
  - No cap.
  - Signing with a "must not go ahead" item.
  - "Busy" not tried again.
  - A volunteer allowed.
  - A page writing the AI log.
- **Rule Zero:**

  | Test | Result |
  |---|---|
  | sg-assess | 28/28 |
  | sg-register | 25/25 |
  | sg-dash | 45/45 |
  | sg-warnings | 30/30 |
  | e3-safeguarding | 38/38 |
  | e3-settings | 21/21 |
  | sg-lead | 14/14 |
  | functions-secrets | 7/7 |
  | sg-warnings-unit | 53/53 |
  | sg-register-unit | 16/16 |
  | present-meeting | 58/58 |

**Found and not fixed:**
- **Names from the event's consent forms** (collectors, children named only on a form) aren't in the refusal list yet. Only the sign-ups' names are.
- **The rules can't see inside the risks list,** so "must not go ahead" blocks signing on the page, not in the database. The draft's overall and the hub's row are still the server's.
- **The fixed instructions are shorter than the model's smallest cacheable size,** so caching will save nothing until they grow. It's harmless.

**For the reviewing window:**
- **Deploy:** the new functions `sgDraftAssessment` and `sgAiStatus`; also `sgWarningsSync`, `sgWarningsNow` and `sgTwoAdultsDaily` again (the register switch, and the attendee count).
  - **functions/package.json gains `@anthropic-ai/sdk` 0.132.1**, pinned exactly (14 days old), so the deploy installs it.
  - No new secret beyond `CHQ_ANTHROPIC_API_KEY`, which both new callables declare.
- **The one real call, Martin's Brazil example, when you say so.** Put the example's words in a file (here `brazil.txt`), then run:

  ```
  SG_AI_KEY="$(gcloud secrets versions access latest --secret=CHQ_ANTHROPIC_API_KEY --project egbc-worship-planner)" node screenshots/events/sg-ai-smoke.mjs --live --text-file brazil.txt --children 30 --leaders 2 --cleared 2 --kind trip --days 10
  ```

  - Change the counts to match the example.
  - It goes through the same `callModel` and checks, writes nothing, and prints the draft and the token counts.
  - **It passes when:** the answer parses; the overall is red; there is a "must not go ahead" item; and the hub's row is there when the leaders are short.
- **The rules** go live when the hub goes live.

### F-275 — AI drafts: a key or set-up problem says so plainly; the one-real-call script ends cleanly (the reviewing window, 23 Oct; the events window)

**Why:**
- The first real call failed with a 400: "This API key is not scoped to a workspace…". The page showed a generic error.
- The smoke script crashed on the way out (UV_HANDLE_CLOSING), after the error and after a good run.
- Martin's key expires about 23 Nov 2026.

**Built:**
- **A key or set-up problem** means the API refused the request itself, not because it was busy: a 400 invalid request, a 401 (a wrong or **expired key**) or a 403. When that happens:
  - The leader sees: **"The AI isn't set up properly yet. Ask the church office."**
  - It is **never retried.** Only 429 and 5xx ("busy") are.
  - `sgAiLog` records the outcome `setup-failed`, with the API's **request id, error type and status**. Still never the words.
  - `sgAiState/current` remembers it (server-only), keeping just a 12-character fingerprint of the key, never the key.
- **`sgAiStatus`** then reports **"set up but not working"** (`state: 'broken'`): "AI drafting is set up but not working yet. Ask the church office, and write the assessment from a template for now." The page shows that line in place of the box.
- **It clears itself:**
  - at once when the key changes (a new fingerprint)
  - when a call works
  - after 6 hours, so one real try can find out whether it has been put right
- **sg-ai-smoke.mjs:**
  - **No `process.exit()`.** It sets the exit code and lets Node finish, so there's no crash on the way out.
  - An API error prints the plain message and "(the API said 400 invalid_request_error, request req_…)", with no stack trace.
  - `--base-url` exists only for its own check, and is accepted for 127.0.0.1 or localhost only.

**Proved:**
- **sg-ai.test.mjs: 55/55** (9 new):
  - a key not scoped to a workspace (400): the plain message, one call only, logged with the request id, type and status
  - sgAiStatus "set up but not working", and the page showing it
  - only a fingerprint kept
  - a new key: ready
  - an expired key (401): the same message and state
  - a call that works: ready
- **sg-ai-smoke.test.mjs: 7/7** (new; runs the script itself against a stand-in on this machine):
  - the 400 and the 401 each give the plain message and exit 1 cleanly
  - a good run passes its four checks and exits 0 cleanly
  - no "UV_HANDLE_CLOSING", "Assertion failed" or stack trace either way
- **Breaks, 5 of 5 caught:**
  - **The one that matters:** a key problem shown as "could not be reached", with nothing remembered.
  - A key problem retried.
  - An expired key (401) not counted as a set-up problem.
  - sgAiStatus never saying "set up but not working".
  - The smoke script letting an API error crash it.

**Deploy:** `sgDraftAssessment` and `sgAiStatus` again. No new secret, and no rules change.

## From the main window, 23 Oct 2026: your office event-booking batch is at Firestore's 1,000-expression limit (H-8)

- **The finding:** "the office books a free room for an event, holding its time" and "with a reason, the office books over it" pass today, but with no room to spare.
  - Adding one `&& true` to `signedIn()` in the built rules makes exactly those two fail. The emulator says "the maximum of 1000 expressions to evaluate has been reached" (bookings create @ the `allow create`, and the roomDays write).
  - **Once the rules are live,** any small addition to a helper that batch calls would stop the office booking a room for an event.
- **Please find headroom** in bookingShape, officeCreate, marksNewBooking and the roomDays rule. For example: work a value out once with `let` instead of calling the same function several times, and check the cheap conditions first so the costly ones are skipped.
- **How to measure:** the scratch method is in H-8. Pad signedIn with N spare `&& true` and see when the two cases fail. Today they fail at N=1; aim for N≥10.
- **It matters for multi-church too:** the church ruleset's gate costs a little more per call, so these two cases fail there until you've found the headroom.

### F-276 — The safeguarding register's last warning: hirers who work with children (F-265's warnings table; the events window, 23 Oct)

**Why:** F-265's warnings table planned "hirers with children: a safeguarding policy missing or out of date, for hirers booked in the next 30 days who work with children". It wasn't built in step 3 (F-271/F-272, "found and not fixed"), because nothing in the hub said which hirers work with children.

**Built:**
- **Hirers page** (egbc-events-money.js, on bookings-admin.html):
  - A new tick on a hirer's record: **"Works with children or young people (they need an in-date safeguarding policy on file)"**.
  - While it's ticked and no safeguarding policy in date is on file:
    - the record says so
    - each of their bookings says **"Works with children: no safeguarding policy in date on file."**
- **The server** (sg-warnings.js, every 15 minutes with the other warnings):
  - For each site, it reads only the hirers ticked "works with children" whose safeguarding policy is missing or has run out (one with no expiry date counts, as on the Hirers page).
  - **Only when there are such hirers** does it read the next 30 days' bookings, by date alone, so **no new index**. It counts those with a hire booked (not declined or cancelled).
  - The warning is amber: **"1 hirer who works with children is booked in the next 30 days with no safeguarding policy in date on file."** "Go to it" leads to the bookings page.
  - It's **counts only: never a hirer's name.**
  - It marks the register's existing control "The hirer's safeguarding policy on file" (`hirerDocs`), so a risk using that control is flagged on Tab A.

**Proved:**
- **sg-warnings-unit.test.mjs: 58/58** (5 new):
  - booked with no policy: amber, 1
  - the control marked
  - an expired policy, or only insurance on file: both counted
  - not counted: a policy in date, a policy with no expiry date, a hirer not booked, a hirer not ticked
  - no hirer's name
- **sg-warnings.test.mjs: 34/34** (4 new):
  - an invented hirer whose policy ran out, booked in 10 days: amber, 1; an unbooked one not counted
  - no name
  - the lead's "Go to it" leads to the bookings page
  - a new policy on file: the warning goes
- **c5-stage3.test.mjs: 48/48** (3 new):
  - no line before the tick
  - ticked and saved, with the rest of the record kept
  - then the booking card says so
- **Breaks, 7 of 7 caught:**
  - **The one that matters:** a hirer's name in the warning (caught by the browser test and the unit test).
  - A policy that has run out still counting (browser and unit).
  - A hirer with no booking coming counted.
  - The tick not saved.
  - The booking card silent.
- **sg-dash: 45/45.**

**Deploy:** `sgWarningsSync` and `sgWarningsNow` again. No rules change.

### F-277 — Event assessments: the required checklist, the host's own requirements, the paediatric first aider, printing, and the live run's three fixes (Martin and the reviewing window, 23 Oct; the events window)

**1. The required checklist** (egbc-sg-templates.js `CHECKLIST`; the server's copy is functions/sg-checklist.cjs; the rules are `sgChecklist()`)
- **Every event (14 questions), in our own words:**
  - insurance (and the insurer told where needed; who checked, when)
  - who is in charge, and the deputy
  - leaders against the ratio, two adults, and checks in date (the hub's own check is shown against this question)
  - consent
  - **a trained paediatric first aider (Yes or No; who, and when their certificate runs out)**
  - medical needs and allergies, in general terms
  - emergencies
  - a 24-hour contact at home
  - head counts, the lost-child plan and hand-back
  - transport
  - the venue or provider (their policy, risk assessment and licences)
  - photos and social media
  - weather and cancellation
  - how incidents are recorded and reported
- **Extras by kind:** overnight 4 (sleeping, night rota, fire, privacy); holiday club 4; off-site 3.
- **Extras by tick:**
  - **"Overseas"** adds 7: government travel advice, passports and visas, travel insurance with medical and repatriation, health advice, local emergency numbers and the embassy, money and communications, checks for local helpers.
  - **"Water, heights or adventurous activities"** adds 3: instructor or licensed provider, lifeguard, equipment.
  - **"Under-8s are going"** goes on by itself when the hub counts any under-8s booked.
- **The church's own questions:** Safeguarding settings, "Your church's own required questions" (for example the insurer's conditions). They are added, never in place of ours.
- **Answers:**
  - Each question takes an answer, or **"Not applicable" with a reason** (stored `N/A: <reason>`).
  - The paediatric first aider is answered **Yes** or **No**, with details.
  - "N/A: ", "Yes: " or "No: " with nothing after doesn't count.
- **Sign-off is refused while any is blank:**
  - **by the rules** (`sgChecklistDone`, the server), not only by the page, which names the ones left and marks them
  - while a host's list waits to be checked
- **The AI is given the checklist with the counts:**
  - Its hazards cover every topic.
  - It suggests answers only where the description says them. They are shown as **"AI suggests (to confirm)"**, with "Use this", and never count as answered until a person saves one.
  - It may tick "overseas" or "adventurous", which only ever adds questions.
- **No paediatric first aider** (a "No"):
  - flagged **Medium, and High when under-8s are going**, in the editor and the print
  - in the warnings for events in the next 14 days
  - and the AI is told to treat it the same way

**2. The host's own requirements** (Martin's addition)
- **On the assessment, under "The host's or organiser's own requirements":**
  - The leader adds their list: a PDF, a Word document, or a photo or scan of a printed sheet, up to 7 MB.
  - A warning first: no child's name, contact or medical details in the file.
- **`sgExtractRequirements`** (server only; claude-sonnet-5-5; the same key, people, caps and log as the drafts):
  - **PDFs and pictures go to Claude as they are,** so scans work.
  - **A Word document's words are taken out first,** because Claude doesn't read .docx itself.
  - Each requirement comes back as a question, with **the line it came from**.
  - **A question or line with a name, phone number or email is left out, counted, and the leader is told.**
- **The original file is kept** in Storage, under `sgRequirements/<event>/…`.
  - It's server only: storage.rules has an explicit closed block in my section.
  - `sgRequirementsFile` hands it back to those who can see the assessment (its writers, the lead and deputy, the trustees, master admins). It refuses a volunteer.
- **The leader checks the list:** changes one, removes a duplicate of ours, adds one that was missed, then confirms.
  - Confirmed, the questions are **required, "From <host>'s requirements: '<line>'"**.
  - A new list waits to be checked again.
- **The log** records `kind: 'requirements'`, the file's size and the outcome. **Never its contents.**

**3. Printing** (sg-print.html; "Print / save as PDF" on each event assessment, on the standing risks, and on each snapshot)
- **A4 portrait; the risk table on landscape pages.**
  - The church's name and logo at the top.
  - "Printed on <date>" and "Page n of N" in the footer.
  - Under print: no buttons, menu or view-as bar.
- **An event's assessment:**
  - **The status in large words:**
    - **"DRAFT: NOT SIGNED OFF"**, with a light watermark, until signed
    - **"Signed off by <name>, <role>, on <date>"**, with the reason for any high risk left (the signer's role is now kept: `signedByRole`)
    - or the "not needed" record
  - **A red box for "must not go ahead"**: its count and its list are the same items.
  - **The event:** when, where, the kind (and overseas), the organiser, leaders (count, names and roles: leaders only), children booked and under 8 (counts), and the ratio, met or NOT met.
  - **The AI line:** "First draft by AI: checked by <name> on <date>" (the first person to save an AI draft) or "AI draft, not yet checked".
  - **The checklist:** every question, with its answer, "Not applicable: <reason>" or **"Not answered"**.
  - The AI's questions still to answer.
  - **The risk table:**
    - **High, Medium or Low in words in every rating** (it reads in black and white), with likelihood × impact
    - the controls as a list; owner; review
    - **no row split across pages**
  - **An appendix:** "Requirements taken from <file>, checked by <name> on <date>", with the list.
  - **Wet-signature boxes:** lead or deputy, trip leader, dates.
- **Never a child's name, contact or medical detail, and never a concern.**
  - A trustee prints without the bookings ("Not available to you").
  - A volunteer can't print it at all.
- **The standing risks** print by activity, with a "Reviewed" signature block. **A snapshot** prints with its banner, the dials and the risks.

**4. The live run's fixes** (the reviewing window's run on the practice trip)
- **"signal is aborted without reason":** `EGBCAuth.call()` gives up after **8 seconds** and takes no longer wait (egbc-auth.js is main's). So the editor makes these calls itself:
  - the same request, to `EGBCAuth.functionUrl`, waiting **180 s**
  - the function's `timeoutSeconds` is 180, and its calls, retries included, finish inside 165 s
  - "Drafting… this takes about a minute."
  - a page that gives up first says **"Still working: reload in a minute to see the draft."**
  - **never a raw error:** anything unexpected is said plainly
- **The red box:** it said "Change the 3 items" over a list of 4 sentences. Now it lists the marked items themselves, with the draft's own sentences after them as its reasons.
- **Nothing booked and nobody named:** the hub adds an amber row, "No children booked and no leaders named yet: the ratio can't be checked". It's never silent.

**Proved:**
- **sg-print.test.mjs: 32/32** (new):
  - no buttons, menu or bar under print; the name and logo; the footer
  - the DRAFT mark and the watermark
  - the red box, 2 = 2 = 2
  - the facts
  - every checklist row, with "Not answered", "Not applicable" and the High paediatric flag
  - the AI line
  - 17 rows with words in every rating, controls as lists, no split rows
  - the appendix, the signature boxes
  - **no child's name, contact, medical detail or concern** (all invented, and all in the data)
  - signed, with name, role, date and reason, and no mark; the "not needed" record
  - **a real A4 PDF: portrait and landscape pages** (`screenshots/events/sg-print-practice-trip.pdf`)
  - the standing risks; a trustee's snapshot; a volunteer refused
- **sg-host.test.mjs: 26/26** (new):
  - **a scanned page sent as an image**; the phone-number question left out and the leader told
  - the file kept in Storage
  - not required and no sign-off until checked; checked, required, and the rules refuse sign-off with them blank
  - **a Word document's words sent**
  - a PDF as a document; a .txt refused plainly
  - the file back to the lead and a trustee, not a volunteer
  - the log without contents; the caps; the print appendix
- **sg-ai.test.mjs: 66/66** (11 new):
  - a 12-second draft arrives
  - "Still working" when the page gives up
  - never a raw error
  - the red box's count = list = marked
  - nothing booked: the hub's row
  - the checklist sent; the "adventurous" tick; suggestions "to confirm" and "Use this"
- **sg-assess.test.mjs: 33/33** (7 new):
  - 14 questions for a trip
  - **the lead refused with 13 blank, and the database refuses a direct write too**
  - "Overseas" adds 7
  - "N/A: <reason>" and "Yes: …" saved
- **Unit tests:**
  - **sg-ai-unit: 58/58:** the page's, the server's and the rules' checklists the same; suggestions; the 0/0 row; the host core; a real Word fixture
  - **sg-warnings-unit: 60/60:** the paediatric warning
- **Rules: 1893/1893** (11 new): blanks, empty, "N/A: " alone, "No: " alone, overseas without its questions, unknown ticks, the host's list unchecked, its questions, the church's own, and all answered.
- **Breaks, 18 of 18 caught:**
  - **The one that matters:** sign-off with the checklist blank (rules).
  - An overseas trip without its questions (rules).
  - The host's list signed unchecked (rules).
  - **The print:**
    - no DRAFT mark
    - a "must not go ahead" item missing
    - an answer missing
    - colour without words
    - the paediatric flag missing
  - A phone-number question kept (browser and unit).
  - The file handed to a volunteer.
  - Word sent as it is.
  - **The page giving up at 8 s.**
  - A raw error shown.
  - The red box disagreeing.
  - Nothing booked, nothing said.
  - The AI's answers counted.
  - No paediatric warning.
- **Rule Zero:**

  | Test | Result |
  |---|---|
  | sg-warnings | 34/34 |
  | sg-dash | 45/45 |
  | sg-register | 25/25 |
  | e3-safeguarding | 38/38 |
  | e3-settings | 21/21 |
  | sg-lead | 14/14 |
  | functions-secrets | 7/7 |
  | sg-register-unit | 16/16 |
  | sg-ai-smoke | 7/7 |
  | check-rules-build (main's) | 8/8 |

**Found and not fixed:**
- **An event shown only to its team (no `audience`) can't be opened by the site's safeguarding lead** unless they're on the team or an admin (`canSeeEvent()`). So they couldn't sign it off, or print it.
  - I didn't widen it now: main's H-8 says the event-booking rules are at Firestore's expression limit.
  - Main's fix for H-8 will make room; then `canSeeEvent()` can add the site's lead.
- **`EGBCAuth.call(name, data)` takes no timeout** (8 s fixed).
  - **For main:** please let it take one (`call(name, data, timeoutMs)`), so pages needn't make long calls themselves.
- **A PDF of the live practice trip** (cev_r2qabp8456bhg1) needs someone signed in to the live hub to press "Print / save as PDF" once this is deployed. I don't sign in to live.
  - `screenshots/events/sg-print-practice-trip.pdf` is an **invented copy** of it from the emulator.
- **Names on a host's list are checked against the event's sign-ups and by pattern** (phones, emails, postcodes). An unknown name written in a requirement is caught only by the model's own check.
- **The rules check that each required question has an answer,** not what it says.

**For the reviewing window:**
- **Deploy (functions):**
  - new: `sgExtractRequirements`, `sgRequirementsFile`
  - again: `sgDraftAssessment`, `sgAiStatus`, `sgWarningsSync`, `sgWarningsNow`
  - no new secret
- **storage.rules** gains a closed block for `sgRequirements/` (my section). Both storage and Firestore rules go live when the hub goes live.
- **The one real host-list call** waits for your word: a real camp's list, as a PDF or a photo.

## From the main window, 23 Oct 2026: EGBCAuth.call takes a timeout

- **`EGBCAuth.call(name, data, { timeoutMs })`.** With no option it waits 8 seconds, as before. With the option it waits that long, up to 9 minutes (a function's own longest).
- **For the safeguarding AI draft (~45 s),** please switch your own 180-second call to `EGBCAuth.call('<your function>', data, { timeoutMs: 180000 })`.
  - It signs in, finds the emulator and reports a function's refusal (e.code) as every other call does.
- **Stamps:** egbc-auth.js is at 202610231000 on every page.
- **Checked by:** tests/check-function-url.mjs, 7/7, with a stand-in slow answer. With no option it gives up at 8 s; 15000 waits for a 9-second answer; 2000 gives up on a 4-second one. Break: call() ignoring the option turns 2 red.

## From the main window, 23 Oct 2026: five of your rules run out of expressions in a normal run (more on H-8)

- **The finding:** in a fully passing run of firestore-rules.test.mjs, the emulator logs "the maximum of 1000 expressions to evaluate has been reached" 126 times, on five rules:

  | Rule | Times |
  |---|---|
  | sgAssessments create/update | 36 |
  | bookings create | 1 |
  | small groups update (groupShape, groupCountOk, under18Ok) | 11 |
  | events/calEvents update (eventCk) | 15 |
  | the catch-all | 63 |

- **Why it matters:** those cases pass only because a refusal was expected anyway or another branch allowed them. Any small addition can turn an allowed save into a refusal once the rules are live.
- **To see it:** run the suite and `grep -c "maximum of 1000"` its output. Aim for 0.
- **The church copy** has three cases that fail on it already: the two office bookings, and "and its named leaders" on sgAssessments.

### F-278 — The printed assessment: a row of dials on page 1, the risks straight after the checklist, the church's own logo (the reviewing window and Martin, 23 Oct; the events window)

- **A row of four dials on page 1,** under the title and above the DRAFT box: the dashboard's own Calla-style dial, drawn in SVG so they print sharp.
  - **Overall rating:** High, Medium or Low, by the hub's sums (the worst after the controls; High while anything must not go ahead).
  - **The checklist:** for example "19 of 23 answered", and how many are not.
  - **Leaders and the ratio:** "Met" or "Not met", and "2 of 3 needed". A reader who can't see the bookings gets "no figure", never a zero.
  - **Risks by colour:** a split dial, with "2 high · 7 medium · 8 low".
  - **Each says its rating or number in words,** so a black-and-white print reads the same.
  - **One row on A4,** so the "must not go ahead" box stays on page 1. On a phone screen they wrap two by two.
  - The overall rating is also a row of the event table.
- **No forced page for the risks:**
  - A change to landscape always starts a new page, which left page 3 nearly empty. So the risk table now stays on A4 portrait, slightly smaller in print, and follows straight after the checklist.
  - Its header repeats on each page, and a heading is never left alone at the foot of a page.
  - **The practice trip's PDF is now 5 pages, all portrait** (it was 8).
- **The logo:** the header uses `logoUrl` from Church details, the field Church settings saves, a Storage link. The plain circle was the test's own invented logo. The test now checks the printed logo is exactly the one in Church details.

**Proved:**
- **sg-print.test.mjs: 39/39.** New checks:
  - four dials in one row, SVG not pictures
  - under the title and above the DRAFT box
  - the words "High", "19 of 23 answered", "Not met", "2 of 3 needed" and "2 high · 7 medium · 8 low", with the colours
  - the overall in the event table
  - every PDF page A4 portrait; the risks follow straight on, the heading kept with them, the header repeating
  - fewer pages than before
  - the logo from Church details
- **Breaks, 2 of 2 caught:**
  - **The one that matters:** a dial in colour only, with no words.
  - The risks forced onto a new page again.
- **The PDF:** `screenshots/events/sg-print-practice-trip.pdf`, from the clean run.

### F-279 — Headroom in the office's event booking (main's H-8), a four-part hall within the limit, and the safeguarding lead sees team-only events (the events window, 23 Oct)

**H-8: Firestore evaluates at most 1,000 expressions a request.** The office booking a room for an event (the booking and the room's day, one batch) was within one of that, so any small addition to a helper would have stopped it once the rules go live.

- **Measured** by `screenshots/events/h8-headroom.test.mjs` (new; main's method made permanent). It adds N spare `&& true` to `signedIn()` in the built rules and runs:
  - the office booking a free room for an event
  - booking over something with a reason
  - the two refusals (time not held; no reason)
  - **a whole hall made of four parts**
- **Before:**

  | Case | Spare expressions it could take |
  |---|---|
  | The ordinary room | **0** (1 failed, as main found) |
  | A whole hall of four parts | **over the limit with none at all**: refused today, once the rules are live (newly found; two parts fitted, three didn't) |

- **What changed** (my booking rules only, the same meaning throughout):
  1. A day with no standing pattern is `null`, "all free", instead of `zeros96()`, a list of 96 zeros built every time.
  2. The room's record is worked out once in the booking's shape check, not four times.
  3. The member's route tests "is this a member booking?" before `active()`.
  4. `roomOpen()` runs once for a room without parts, not twice. The room's parts and the day of the week are worked out once, not per part.
  5. **`theOffice()`** reads the person's record once, through `officeFor()`, instead of `active()` three times. It's the same as `isAdmin() || bookingsAdminOf()`; main's `isAdmin()` is untouched.
  6. **"Free" for the office** is read from the room's day after the write: exactly 1 across the booking's time, and the room not closed that day.
     - The page always writes "as it was, plus one", so that's true only if it was all free before.
     - The office may already write a room's day as it likes, so reading the day as it was added nothing for the office but cost.
     - **Members and the public are still checked against the day as it was**, since they can't write it freely.
     - "Booked over, with a reason" still needs the time held.
- **After:**

  | Case | Spare expressions it can take |
  |---|---|
  | The ordinary room | **at least 80** (main asked for 10) |
  | The four-part hall | **at least 40** |

  At 160 the emulator won't load the rules at all.

**The safeguarding lead sees team-only events** (the reviewing window). The rules' `canSeeEvent()` now lets the safeguarding lead and deputy of the event's own site read it, so an event shown only to its team, like the practice trip, can be assessed, signed off and printed. It's the last alternative, so it costs the other cases nothing. Seeing it is all: they don't edit it.

**Also:**
- room-card.test.mjs still expected "when the church switches over", which main reworded to "when the hub goes live". The check is updated.
- Places' floor-plan line is now plain: "Floor plans can be put up when the hub goes live." The line about the hub's storage not yet being private is gone, as asked for Present.

**Proved:**
- **h8-headroom.test.mjs: 5/5** (new).
- **Rules: 1900/1900.** 7 new checks:
  - a team-only event seen by its team, its site's lead and deputy
  - not by another site's lead, a volunteer, or anyone signed out
  - the lead doesn't edit it
- **sg-print.test.mjs:** a team-only copy of the practice trip printed by its site's lead.
- **Breaks, 4 of 4 caught:**
  - **The one that matters:** the office checks each part's day as it was again, and the four-part hall goes over the limit.
  - The office books over something without saying so.
  - A team-only event hidden from its lead again (rules and print).
- **Rule Zero, one at a time:**

  | Test | Result |
  |---|---|
  | combined-rooms | 33/33 |
  | close-room | 29/29 |
  | r1-rooms | 27/27 |
  | r2-bookings | 50/50 |
  | r3-bookings | 42/42 |
  | r3-event-rooms | 20/20 |
  | roomday | 34/34 |
  | series | 15/15 |
  | room-card | 55/55 |
  | c5-hire-quote | 16/16 |
  | c5-stage2 | 32/32 |
  | c5-stage3 | 48/48 |
  | e3-safeguarding | 38/38 |
  | sg-assess | 33/33 |
  | sg-print | 39/39 |
  | main's check-rules-build | 8/8 |

**For the main window:** the two booking cases that were at the limit in the church ruleset (H-8) should now pass there too, with room to spare. Please re-run `AS_CHURCH=mc-test`. The built files are regenerated.

**Deploy:** nothing. The rules go live when the hub goes live.


### F-280 — PLAN: proper health, safety and fire risk assessments for buildings, events and room hire, reusing the safeguarding work; and a safeguarding part for camps (Martin, 23 Oct; for review; NOTHING BUILT)

**What Martin asked:**
- The safeguarding assessment's features (F-265 to F-279) on the hub's other risk assessments. They must be a proper health, safety and fire risk assessment, and the hub must read external ones. Safeguarding stays separate. Everything must work for any church.
- **Second addition:** a camp assessment, and the gaps in the safeguarding checklist that the reviewing window found. It compared the Diocese of Derby's 2018 guide and Newday's group-leader pages with egbc-sg-templates.js (OneDrive, "New hub\Camp risk check\camp-coverage.md"). That is section 10.

**No building until Martin answers the questions at the end.**

---

**1. What the hub has today** (surveyed file by file)

| Where | What it has | What it doesn't have |
|---|---|---|
| **risk.html**, the "Live risk register" (F-234) | Hazards per building, likelihood × severity 1–5 (High 15+, Medium 5+, Low: the same bands as safeguarding); 14 starter hazards; **controls are the building's compliance checks**, so a hazard turns amber or red when a check is overdue or a safety job is open; the professional fire and H&S reports uploaded and stored (assessor, date, next review), which also records the "fire-ra" / "hs-ra" check; "changes since the last report"; trustee snapshots ("Live risk management: …" banner); the visitors' GEEP | No owner or review date on a hazard; no rating after the controls; no actions of its own (only maintenance jobs on checks); the reports are **stored but never read**; no AI, no dials, no blocking checklist; the print is the screen; sign-off is hard-wired to the teams "Elders" and "Church office" |
| **compliance.html** and building.html (F-230 to F-233) | About 85 checks (fire, electrics and PAT, gas, water, asbestos, H&S, food, insurance, security, data), each legal, standard or good practice, with floors the rules enforce; certificates per check; the extinguisher register; the yearly trustee sign-off; reminders; Val's "my checks" | No dials; **sign-off isn't blocked by anything red**; certificates aren't read; the print is the screen; no named roles; "event-ra" exists but nothing ever makes it due |
| **Ordinary events** (events-admin.html) | A free-text checklist; a capacity (a booking limit only); the event team | **No risk assessment at all**; capacity isn't checked against the room's fire maximum; no first aid, food, insurance or fire questions |
| **Room hire** (book.html, bookings-admin.html, the Hirers tab) | Each room's fire-safety maximum, **enforced by the rules**; hirers' documents (insurance, safeguarding policy, **risk assessment**) with expiry reminders; versioned terms | The hirer's risk assessment is **stored, never read, never required**; no risk questions to hirers |
| **PEEPs, GEEPs, fire roll-call** | Personal and visitors' evacuation plans; the fire wardens and stewards (on Safeguarding settings) | Not linked to any fire risk assessment |
| **Maintenance** | Jobs (with a "safety" flag, an owner and a due date); finishing a job on a check records the check | — |
| **Roles** | "Church office" (admin), "Elders" (trustees), "Maintenance" teams; the bookings admin per site | **No health and safety lead, fire safety lead, "responsible person" or premises role anywhere** |

---

**2. The shape: one assessment engine, two separate registers**
- **Shared code, not shared data.** F-265 to F-279's pieces become a small shared engine. The safeguarding register keeps using it, unchanged, proved by its own tests before anything new uses it.

  | Shared piece | Taken from |
  |---|---|
  | **Ratings** | the same bands as both registers |
  | **The required checklist** (`checklistFor`, `answered`, the rules' "blocks sign-off") | egbc-sg-templates.js and firestore.rules |
  | **The dials** | egbc-sg-dash.js `dial()`, moved to a shared file |
  | **The A4 print** (DRAFT until signed, the red box, dials, checklist, risk table in words, appendix, signatures) | sg-print.html, its sections made pluggable |
  | **The AI draft** (the personal-details refusal, the hub's own rows, the hub's own sums, the caps, the log, key and set-up errors, no other model, the long call) | functions/sg-ai.js and sg-ai-core.cjs |
  | **The document reader** (PDF and pictures natively, scans read by Claude itself, Word turned into words first, personal details left out, the original kept, checked by a person) | sg-requirements-core.cjs |

- **Separate data and rules:** new collections `raAssessments`, `raActions` and `raFiles`, with their own rule helpers and their own pages.
  - **Nothing from the safeguarding register shows on the building or event side**, and nobody gains safeguarding access by being, for example, the health and safety lead.
  - The AI log keeps a separate kind and its own caps (question 9).
  - risk.html's starter hazard "safeguarding" stays only as a pointer to the safeguarding register, with no data.
- **For any church:** every role, threshold, checklist addition and sign-off rule is a setting, with EGBC's values as the defaults.

---

**3. The kinds of assessment**

**A. Health and safety, for each building.** It follows the HSE's five steps, each a section of the assessment and of the print:
1. **Find the hazards.** From the building's profile (the 31 questions compliance.html already asks), risk.html's starter hazards, and a walk-round.
   - **Each room gets Derby's room hazards** as starters: entrances, exits and windows; stairs; heating; the kitchen and food hygiene; furniture; electrics; cleaning materials; craft materials and tools; toilets and storage; fire and carbon monoxide; plants and toys.
   - **They belong here, not in safeguarding.** A group's safeguarding assessment links to its room's (section 10.8).
2. **Decide who might be harmed and how.** Staff, volunteers, visitors, children, people who are older or disabled, contractors, hirers.
3. **Evaluate the risks and decide on precautions.** Likelihood × severity before and after the controls, **by the hub's own sums, never the AI's**. The controls are the compliance checks already there, plus written ones.
4. **Record the findings and act.** Each significant finding has an owner, and each action a priority and a target date. An action becomes a maintenance job.
5. **Review.** A review date, which turns amber and then red, plus "review after a significant change" (building work, an incident, new activity).

**How this meets "suitable and sufficient"** (Management of Health and Safety at Work Regulations 1999, regulation 3; the HSE's guidance):
- **It identifies the significant risks.** Prompted by the profile, the starters and a required checklist, so nothing obvious is skipped.
- **It considers everyone affected,** including those more at risk (step 2 is required, with the groups listed).
- **It's proportionate.** A small hall gets a short assessment; a busy building with a kitchen and a lift gets the sections its profile calls for.
- **It's done by a competent person.** The assessment records who did it, and, for a complex building, says plainly that a competent person (a professional assessor) should do or check it.
- **It's recorded.** Required in law with five or more employees; the hub records it for every church.
- **It's kept under review.** A review date, plus the "after a change" prompts.
- **It's remedial, not just descriptive.** Actions with owners and dates, tracked to done.

**B. Fire, for each building.** Under the Regulatory Reform (Fire Safety) Order 2005, laid out like PAS 79-1:
1. **The premises and how they're used:** construction, floors, rooms (from places-admin.html), occupancy (each room's fire maximum), hours, hirers.
2. **The responsible person** (question 3), and who carries out the assessment.
3. **The people at risk,** including anyone who needs help to get out.
   - It links the PEEPs and GEEPs as **counts only** ("3 personal evacuation plans, 1 for visitors").
   - It **never names anyone on the print**; the fire roll-call keeps the names.
4. **Fire hazards:** ignition sources (electrics, heaters, cooking, candles, smoking), fuel (storage, furnishings, waste), oxygen (none usually; noted).
5. **Fire protection:**
   - detection and alarm
   - escape routes, emergency lighting and signs
   - firefighting equipment (the extinguisher register already in the hub)
   - compartmentation and fire doors
6. **Management:** training (fire marshals), drills, testing and maintenance records.
   - These **link the compliance checks already in the hub** (alarm tests, emergency lighting, extinguishers, drills, fire marshal training), showing each one's last date and colour.
7. **The action plan:** each action with a priority (question 8) and a target date, becoming a maintenance job.
8. **The review date.**

Each building has its own.

**C. An event** (a concert, a carol service with candles, a fair, an outside hirer's event). A shorter assessment that **refers back to its building's fire and H&S assessments** (by name and date). It adds only what the event changes:
- numbers against each room's fire maximum
- candles or any naked flame
- stewards, and their briefing
- equipment brought in (PAT)
- food and allergens
- outdoor areas, the car park and traffic
- weather
- licensing (music, alcohol, a temporary event notice)
- first aiders on the day

The hub adds its own rows from its numbers, as the safeguarding draft does its "not enough leaders" row:
- "300 people booked, fire maximum 250: must not go ahead as described"
- "Candles in the hall: refers to the building's fire assessment, section 4"

**D. Room hire.** The hirer's own risk assessment (often required by the terms):
- read from their document
- **checked against the building's**: the building's significant hazards they haven't addressed, and their numbers against the room's fire maximum
- the office confirms

---

**4. Reading external assessments** (a professional fire risk assessment, an H&S assessment, an insurer's survey, or a hirer's own; PDF, Word, or a photo or scan)
- **Claude reads it** (the same reader as the host's requirements, F-277) and pulls out:
  - **the assessor, the date, the next review date and the overall rating**
  - **each significant finding** as a hazard. Where the report gives likelihood and severity, the hub re-scores them with its own sums. Where it gives only words (e.g. "moderate"), those are kept as "the assessor's rating", and the person is asked to set likelihood × severity.
  - **each action, with its priority and deadline.** A person confirms each one, then it **becomes a job in the existing maintenance list** (safety flag, owner, due date), and the finished job is recorded against the assessment.
  - **any heading a proper assessment should have that the document lacks, flagged as a gap.** For example, a fire assessment with no section on people needing help to get out, or no review date.
- **The original file is kept,** where risk.html already keeps reports.
- **The hub's copy is labelled "Read from <assessor>'s report, checked by <name> on <date>".**
- A professional report also fills risk.html's existing record (assessor, date, next review) and records the "fire-ra" or "hs-ra" check, as uploading one does today.
- **A hirer's assessment** is read the same way and compared with the building's, as in 3D.
- **Personal details** in a report are left out of what's saved, and the reader is told. The file itself is kept as it came, readable only by those who read the building's assessments.

---

**5. The AI first draft**
- **From a plain description,** e.g. "Christmas concert, 300 people, candles, hall and car park". It's the same callable pattern as safeguarding, with its own instructions for each kind (five steps; PAS 79-1 headings; the event's changes).
- **The counts the hub knows go with it:**
  - each room's fire maximum
  - the compliance checks' colours
  - the first aiders' and fire marshals' training dates (counts only)
  - the PEEPs and GEEPs (counts)
- **The hub's own sums, never the AI's,** for every rating and the overall. **The hub's own rows** where its numbers say so (capacity; anything red in compliance).
- Labelled "First draft by AI: check every line". The AI's checklist answers are suggestions "to confirm".

---

**6. The required checklist** (blocks sign-off by the rules until each is answered or "not applicable, with a reason")
- **Every kind starts with insurance:** buildings, public liability, and employers' liability where there are staff.
- **Building H&S:** the five steps, then by profile: first aid, food hygiene, electrics, gas, water, asbestos, working at height, lone working, manual handling, contractors, accessibility.
- **Building fire:** the PAS 79-1 headings above.
- **Event:**
  - insurance
  - the building's assessments in date
  - capacity against the fire maximum
  - fire (flames, exits, stewards, the briefing)
  - first aid
  - food hygiene and allergens
  - electrics brought in
  - crowd management
  - accessibility
  - weather or cancellation
  - licensing
  - incidents
- **Hire:** the hirer's insurance, their risk assessment, their first aid, food, electrics, numbers.
- **A church adds its own questions** (as for safeguarding); the core can't be removed.

---

**7. Dials, and the print**
- **A building dashboard,** in the Calla style, on risk.html's first tab:
  - the fire assessment in date
  - the H&S assessment in date
  - compliance checks in date (%)
  - actions overdue
  - open safety issues
  - the checklist answered
- **On each print, a row of dials** as on the safeguarding print.
- **The A4 print** (shared with safeguarding):
  - DRAFT until signed
  - "Signed off by <name>, <role>, on <date>"
  - the red box for anything that must not go ahead
  - the sections of its kind
  - the risk table in words
  - the action plan with priorities and dates
  - an appendix for the external report read
  - signature boxes
- **"Not legal advice," on the page and the print:** *"The hub helps the church record its assessment. The responsible person remains responsible for it. For a complex building, or where you're unsure, a competent person, such as a professional fire risk assessor, should carry out or check the assessment."* (Wording for Martin to approve.)

---

**8. Who signs off: church settings, with EGBC's defaults** (questions 2, 4 and 10)
- **New roles,** set for each building on a "Health and safety settings" card:
  - a **health and safety lead** and deputy
  - a **fire safety lead** (may be the same person)
  - the **responsible person** shown on the fire assessment
- **Defaults to discuss:**

  | Kind | Signs off |
  |---|---|
  | Building H&S and fire | the H&S or fire lead, then a trustee countersigns |
  | Event | the organiser, then the H&S lead |
  | Hire | the office, then the H&S lead |

- **The rules check who signs,** as `sgLeadOf()` does for safeguarding.

---

**9. Steps** (each with its own checks, breaks and report, as before)
1. **The shared engine:** moved out of the safeguarding code with no change. Proof: every safeguarding test passes unchanged.
2. The roles and settings.
3. **The building's H&S and fire assessments,** linked to risk.html (question 1) and compliance.
4. **Reading external reports,** and their actions becoming jobs.
5. **Events and hire,** referring back to the building's.
6. **The dials and the print.**
7. **The AI drafts** (one real call each, only with the reviewing window's say-so).

Steps 2 to 7 wait for Martin's answers. **The order of the two parts is question 22:** my recommendation is the safeguarding part (section 10) first. It is smaller and changes the files step 1 would move, and the Newday test can then happen sooner.

---

**10. The safeguarding part: camps, and the gaps found**

**Where it lives:**
- All of it stays in the safeguarding register, under its own rules and its own readers.
- Nothing goes to the building side except one link (10.8).
- Nobody on the building side gains any safeguarding access.
- "Our own words" throughout: nothing is copied from Derby or Newday.

**10.1 A new event kind, "Camp or festival"**
- **It gets its own questions and starter risks,** in the templates, the server's copy (functions/sg-checklist.cjs) and the rules' required list, as for the other kinds.
- **The lead's or deputy's sign-off is required automatically** when anyone under 18 goes (question 14).
- **Questions** (each required, or "not applicable, with a reason"):
  - **Tents:** where they go, and the spacing the site asks for (e.g. 2 m between tents, 3 m for cooking tents, caravans and motorhomes, 1.5 m from the boundary); guy lines marked.
  - **Fire in tents:** no candles, smoking or vaping in tents; gas lights watched; an extinguisher and a fire blanket by the cooking area.
  - **Cooking:** gas only (or what the site allows); a designated cooking tent away from sleeping tents; fuel stored away from stoves and tents; who supervises; the stove briefing.
  - **Food:** whoever caters holds a Level 2 food hygiene certificate; hand washing and sanitiser before meals; hot water for washing up.
  - **Nights:**
    - the tent check at a set time
    - single-gender tents
    - where the adults sleep (central, and known to everyone)
    - a leader contactable on site day and night
  - **Medical:**
    - a named medical officer everyone knows (a role, not a name, if you prefer)
    - the site's medical facilities, and that young people know where they are
    - **adults' health forms, with next of kin, as well as children's.** These are kept by the medical officer, never in the hub; the hub records only "collected: yes".
  - **The site's rules:** generators, barbecues, alcohol, smoking and vaping, wristbands, electrics (PAT-tested, not tampered with), forms and their deadlines.
  - **Vehicles:** car-free times; where vehicles go.
  - **Leaving the site:** never alone; tell a leader first; never on foot where the site says so; off site by the set time on the last day.
  - **Set-up day:** who goes; under-18s only if essential and supervised at all times.
- **Starter risks** (likelihood × severity by the hub's sums, as now):
  - fire in a tent
  - burns or gas from cooking
  - carbon monoxide from a stove or heater in a tent
  - trips on guy lines in the dark
  - food poisoning
  - a young person leaving the site
  - harm at night
  - a vehicle moving on site
  - someone lost in a large crowd
  - the weather (heat, cold, flooding)
  - an adult's own health emergency
- **A camp also gets the overnight questions** (question 13).

**10.2 Three new core questions for every event**
- **Behaviour:** what's expected, how it's handled, and the host's behaviour policy or code of conduct if there is one.
- **Accessibility needs:** how they're found out and met, and the host's accessibility contact.
- **Visitors and members of the public:** who else will be there, and how the group is kept apart where needed.
- **The standing register gets them too** for regular groups: behaviour and visitors as starter risks (Derby's areas 4 and 5).
- **Assessments already signed off don't change.** Unsigned ones gain the questions (question 16).

**10.3 Leader checks: a reference, and the host's policy**
- **A church leader's reference:** received, with its date.
  - It is kept with each leader's DBS and training (`leaderChecks`), so it is recorded once and shown on every event. The same people read it: the lead and deputy.
- **"Has read the host's safeguarding policy":** a tick per leader **per event**, only when the event has a host.
  - When the host's requirements say so (Newday does), it becomes a required question.
- **The event's leader check shows both.** A missing one is amber, and red when the host requires it.
- How long a reference lasts, and whether to add Derby's confidential declaration, is question 15.

**10.4 "Still to do" and "trustees noted" (Derby's steps 4 and 5)**
- **Each risk can have "still to do" actions:** what, who (a named person or a role), and by when; up to 5 per risk.
  - An overdue action turns the risk amber in the warnings.
  - The print gets a "Still to do" table.
  - Whether sign-off can happen with open actions is question 17.
- **"Trustees noted on <date>":**
  - After sign-off, a trustee ticks "noted". The name and date are recorded and printed.
  - It doesn't stop the event.
  - Which kinds need it is question 18.

**10.5 Prompts to review a standing risk again**
- **When an incident is recorded on an event linked to an activity,** that activity's standing risks show "Review prompted: an incident on <date>". This happens in the daily safeguarding check (functions/sg-warnings.js).
  - **Only the date and the count are used. Nothing of the incident is copied:** not its words, its people or its follow-up.
- **When a group's size changes a lot** since the risk was last reviewed, the risk shows the same prompt. The hub keeps the number of children at each review, and the threshold is question 19.
- **Both show amber on the dials and in the warnings** until someone reviews the risk.

**10.6 The host's requirements from web pages or pasted text**
- **Pasted text** goes straight to the same reader as a file (F-277).
- **Links:** up to 5 starting addresses, read by the function itself (question 20). It reads only what is safe:
  - **Https only,** on the standard port; no sign-in, no cookies.
  - **Public addresses only:**
    - The name is looked up, and anything private is refused: private, loopback, link-local (including 169.254.169.254, the cloud's own metadata address), shared, multicast, and IPv6 local.
    - The connection goes to the address that was checked, so the name can't be switched to a private address between the check and the connection.
  - **Redirects are not followed blindly.** Each one is checked by the same rules, at most 3, and never to plain http.
  - **Caps:**
    - 2 MB a page
    - 20 pages in all
    - 45 seconds in all
    - web pages, plain text or PDF only
  - **Links are followed one level down, on the same site only.** A help-centre folder page (like Newday's) lists its articles; those articles are read, and nothing further.
- **Scripts, menus and page furniture are stripped,** and only the words go to Claude, with personal details left out as now.
- **The leader sees every page read,** with its address, and each suggested question with the page it came from. **A person checks the list before anything is saved**, as for a file.
- **What's kept:** the addresses, the date read, and the text read, in Storage beside where files are kept (question 21).
- **Tests:** a stub web server and a stub address lookup, with no real network. Each protection has a break:
  - plain http
  - a private address
  - a name that turns private
  - a redirect to a private address
  - a too-large page
  - too many pages
  - a link to another site
- **The first real test** replaces waiting for a camp document:
  - **What:** Newday's pages on a practice event named "Example: Newday camp (test, not real)":
    - https://newday.freshdesk.com/support/solutions/folders/80000687928
    - plus the Being a Group Coordinator, General Information and Accessibility folders
  - **Who:** only on the reviewing window's word, by the reviewing window (I don't write live data or sign in to the live hub; question 23).
  - **Still needed:** the three folders' addresses.

**10.7 Never socket covers**
- **Every AI instruction says so:** the safeguarding draft, the host's requirements, and the new H&S and fire drafts. "Never recommend socket covers or plug-in socket protectors: UK sockets are shuttered, and safety bodies advise against them."
- **The server also checks the reply.** Any control, answer or suggestion mentioning socket covers, protectors, inserts or plugs is removed. The leader is told "One suggestion was left out: socket covers aren't advised for UK sockets."
- **Tests:**
  - the instruction is in what's sent
  - a stub reply that recommends socket covers never reaches the page or the database
  - **Break:** the server check removed
  - A real-model check only as one of the real calls, on the reviewing window's word.

**10.8 Room hazards: a link only**
- **Derby's room hazards go in the building's H&S assessment** (section 3A, step 1).
- **The link:** a regular group whose activity is in a room shows "This room's health and safety assessment: <date>, <colour>", linking to it.
  - **Only that date and colour cross over.** The H&S assessment itself needs H&S access to read.
  - Nothing from safeguarding goes the other way.

**Safeguarding steps** (each with its own checks, breaks and report):
1. **Never socket covers** (10.7). It's small and it protects every later AI call.
2. **The camp kind and the three core questions** (10.1, 10.2).
3. **Leader checks** (10.3).
4. **"Still to do" and "trustees noted"** (10.4).
5. **Re-review prompts** (10.5).
6. **Web pages and pasted text** (10.6), then the Newday real call on the reviewing window's word.

---

**11. Questions for Martin** (my recommended answer first)

1. **risk.html and the new assessments:**
   - **(a, recommended)** Keep risk.html as the day-to-day "live register" and add the formal fire and H&S assessments alongside it. Their significant findings feed its hazards, so the daily checks keep watching them.
   - (b) Turn risk.html itself into the assessment.
2. **Who signs a building's fire and H&S assessments:**
   - **(a, recommended)** The named H&S or fire lead signs, then a trustee countersigns.
   - (b) A trustee alone.
   - (c) The lead alone.
3. **The "responsible person" on the fire assessment:**
   - **(a, recommended)** "The trustees of <church>", with the named fire safety lead as the person who acts for them.
   - (b) A named individual.
4. **Which events need an assessment:**
   - **(a, recommended)** Any event the organiser marks, plus automatically when it has 100 or more people (a setting), naked flames, food, alcohol, outdoor areas, equipment brought in, or an outside hirer.
   - (b) Every event.
5. **Who signs an event's:**
   - **(a, recommended)** The organiser, then the H&S lead.
   - (b) The H&S lead alone.
6. **Hirers' own risk assessments:**
   - **(a, recommended)** Required for the booking types the office ticks (a setting, e.g. events open to the public, food, equipment); read and checked against the building's; the office confirms.
   - (b) Required for every hire.
   - (c) Optional.
7. **Actions from a report:**
   - **(a, recommended)** Become maintenance jobs (safety-flagged, with an owner and a due date) once a person confirms each.
   - (b) Stay in the assessment only.
8. **Action priorities:**
   - **(a, recommended)** High, Medium or Low, with default target dates of 1 month, 3 months and 6 months (settings). Anything the assessor calls "immediate" is flagged red at once.
   - (b) The assessor's own priorities as written.
9. **AI caps:**
   - **(a, recommended)** Separate from safeguarding's, with the same defaults (20 a day for the church, 5 a person).
   - (b) Shared.
10. **The roles:**
    - **(a, recommended)** One H&S lead and a deputy for each building, and a fire safety lead who may be the same person.
    - (b) One H&S lead for the whole church.
11. **Employees:** does EGBC have five or more? It changes only one line of wording; the hub records the assessment either way.
12. **The "not legal advice" wording** in section 7: as written, or changed?

**The safeguarding part (section 10):**

13. **A camp and the overnight questions:**
    - **(a, recommended)** A camp also gets every overnight question (sleeping, the night rota, and so on) plus its own.
    - (b) Camp questions only.
14. **When a camp needs the safeguarding lead's or deputy's sign-off:**
    - **(a, recommended)** Whenever anyone under 18 is booked, or the organiser ticks "under-18s going".
    - (b) Every camp, whoever goes.
15. **The leader's reference:**
    - **(a, recommended)** Recorded once per leader with its date, lasting 3 years (a setting), and shown on every event. "Read the host's policy" is ticked per leader per event.
    - (b) Both per event.
    - **Also:** add Derby's confidential declaration as a third item? I recommend yes, recorded the same way as the reference.
16. **The three new core questions** (behaviour, accessibility, visitors):
    - **(a, recommended)** Required on every assessment not yet signed off, from the day they're built. Signed ones are unchanged.
    - (b) New events only.
17. **"Still to do" actions and sign-off:**
    - **(a, recommended)** Sign-off is allowed with open actions that have a person and a date, unless the risk is still red after its controls.
    - (b) Every action done before sign-off.
18. **"Trustees noted":**
    - **(a, recommended)** For camps, overnights, trips abroad and adventurous activities (a setting). A trustee ticks it after sign-off, and it doesn't stop the event.
    - (b) Every event.
    - (c) Required before the event can go ahead.
19. **Re-review prompts:**
    - **(a, recommended)** After any incident on that activity, and when the group's size has changed by a quarter or more since the last review (a setting).
    - (b) A different threshold: say which.
20. **Reading web pages:**
    - **(a, recommended)** The function reads them itself, with the protections in 10.6, so every check is ours, tested and logged.
    - (b) Claude's own web-reading tool, which needs less code, but its checks aren't ours to test.
21. **Keeping what was read from web pages:**
    - **(a, recommended)** The addresses, the date and the text, kept like an uploaded file, so the record shows what the requirements were on that day.
    - (b) The addresses and date only.
22. **Which part first:**
    - **(a, recommended)** The safeguarding part (section 10), then the H&S and fire work.
    - (b) H&S and fire first.
23. **The Newday practice event on the live hub:**
    - **(a, recommended)** The reviewing window or Martin creates "Example: Newday camp (test, not real)" on the live hub and runs the one real call there, with the three folders' addresses.
    - (b) I write a small script for Martin to run that creates it.

---

**Also done with this (not part of the plan):** main's `EGBCAuth.call(name, data, { timeoutMs })` (aa740f1b) now carries the safeguarding AI draft, host-requirements, file and status calls. My own long call is gone; the waits (180 s, 60 s, 30 s) and the plain messages are the same.
- **Caught on the way:** a browser's "gave up waiting" error carries the old number code 20, so the page took it for the server's refusal and said "couldn't be finished" instead of "Still working: reload in a minute". Only word codes count as the server's now.
- **Breaks:** the shared call without the longer wait, a timeout shown raw, and any code passed through. Each was caught by sg-ai.test.mjs.
- **Tests:** sg-ai and sg-host pass.

### F-281 — Safeguarding step 1: the AI never recommends socket covers; Martin's answers to F-280; every team name and size limit in the events window's files (the events window, 23 Oct)

**Martin's answers to F-280 (via the reviewing window):**
- **All 23 recommended answers, except question 11.** Employees are now a number: "How many people does the church employ (paid, including part-time)?" EGBC has fewer than 5 (2 in the test data).
- **The H&S side scales from that number:**

  | Employees | What applies |
  |---|---|
  | **1 or more** | employers' liability in force, with the certificate displayed; RIDDOR (the incident record says when an injury to an employee is reportable, and to whom); the "Health and safety law" poster or leaflet; a first-aid needs assessment that covers employees |
  | **5 or more** | a written H&S policy, and the significant findings recorded in writing (a legal duty at this size); the "suitable and sufficient" wording changes to match |
  | **Anyone who uses a screen as a regular part of their job** | a DSE workstation assessment for each person, asked as a checklist question (no staff register) |
  | **Larger staff teams** | staff H&S training records, consulting employees, and lone-working arrangements for staff |

- **Order:** the safeguarding part first (steps S1 to S6 in F-280 section 10), then H&S and fire.
- **Newday's addresses** for the first real web-page test (S6):
  - folders 80000687928, 80000639163, 80000639070, 80000704765 and 80000639039 on newday.freshdesk.com
  - The reviewing window creates the practice event and runs the one real call once S6 is built and deployed.
- **Added to the safeguarding part** (from the "Youth Work & Trip Operations Manual", camp-coverage.md section 6):
  - **(a) The DBS level per leader:** "Enhanced, with the children's barred list" or not, with the date seen. Goes in **S3**.
  - **(b) Mixed groups:** "Is there at least one male and one female leader?" (Yes / No / not a mixed group); a No is amber. Nobody's sex is stored. Goes in **S2**.
  - **(c) Transport:** roadworthiness (MOT, a check before the journey), drivers' hours and rest breaks, and the right licence for a minibus (D1 or a permit). Goes in **S2**.
  - **(d) Insurance:** the public liability cover amount, flagged under £1 million. Goes in **S2**; the building side's certificate and amount go in H&S step 2.
  - **(e) A church setting for its denomination's safeguarding guidance** (name and link), shown on the assessment page and given to the AI, with NSPCC Learning in the help. Goes in **S2**.

**S1, built: never socket covers** (F-280 10.7)
- **The instruction is in every AI request** (functions/sg-ai-core.cjs `SOCKETS`): the safeguarding draft and the host's requirements. The H&S and fire drafts will use the same line.
- **The server also checks each reply,** with one shared test, `socketCover()`. It catches socket, plug or outlet covers, protectors, inserts, guards, caps, blanks and blockers, and plastic safety plugs. It leaves alone "check sockets and leads", "a plug-in heater" and PAT testing.
- **What is left out of a draft:** any matching control; a hazard about them; a hazard left with no control once they're out; a "must not" line; a question; a suggested answer; and the summary.
- **What is left out of a host's list:** a requirement that asks for them, even when it is the host's own.
- **The count is kept** (`source.leftOut`, `host.leftOut`).
- **The page says so:**
  - on a draft: "8 suggestions were left out: socket covers aren't advised for UK sockets, which have shutters built in."
  - on a host's list: "One requirement was left out: … If the host insists on them, talk to the host."
- **Tests:** sg-ai.test.mjs section 13 and sg-host.test.mjs section 9. The test reply recommends socket covers in eight places, and none of them reaches the database or the page.
- No rules change. **Deploy:** sgDraftAssessment and sgExtractRequirements (the reviewing window's).

**Every place that names a team** (these wait for main's "Your teams" mapping; I won't build my own):

| Where | What | Fixed in |
|---|---|---|
| firestore.rules `cmpAdmin()` / `cmpTrustee()` | 'Church office' / 'Elders' decide compliance and risk | main's mapping, then H&S step 2 |
| firestore.rules `meetingRunner()` | 'Church office' or 'Elders' | main's mapping |
| firestore.rules (maintenance jobs) | `hasAny(['Maintenance'])` | main's mapping, then H&S step 2 |
| firestore.rules safeguarding | `get('trusteeTeam', 'Elders')`: already a setting, one team only | main's mapping, then S4 ("trustees noted") |
| firestore.rules money | `paymentSettings/team`, default 'Finance': already a setting | main's mapping |
| risk.html | 'Church office', 'Elders', and "for the church office, the trustees…" | main's mapping, then H&S step 2 |
| compliance.html | 'Church office', 'Elders'; "The trustees (the Elders) sign off"; "the church office" | main's mapping, then H&S step 2 |
| maintenance.html | 'Maintenance'; "the office has been told", "The Maintenance team will see it" | main's mapping, then H&S step 2 |
| functions/compliance.js | the monthly summary goes to 'Church office' or 'Elders' | main's mapping, then H&S step 2 |
| safeguarding-settings.html, safeguarding-risk.html, functions/sg-warnings.js | trusteeTeam default 'Elders' | main's mapping, then S4 |
| functions/sg-ai-core.cjs, safeguarding.html | "Ask the church office" / "speak to the church office or a minister" | main's mapping (the office job's name), then S2 |
| places-admin.html `VIDEO_ROOMS` | EGBC's own video-room names (not teams, but EGBC's) | main (it's the fifth copy of main's list) |

**Every size limit that would cut off a big church** (each becomes a setting or no limit, in my steps):

| Limit | Where | Fixed in |
|---|---|---|
| **20 leaders per event** | rules, event `leaderIds` (unrolled 20 times) | **S3** (leader checks) |
| 2 or 3 leaders cleared per save | rules `allCleared` | **S3** |
| 10 small-group leaders, 30 kids' leaders, 60 kids'-morning leaders, 30 or 40 on/away lists | rules | **S3** |
| **60 fire wardens and stewards** | rules `fireRollCall`, safeguarding-settings `slice(0, 60)` | **H&S step 3** (fire), one roll-call per building, no limit |
| **3 office sites** | rules `officeOfListed` (sites 0–2), egbc-events-money.js `slice(0, 3)` | **H&S step 2**: a lookup by site, so any number of sites |
| **30 event team members** | events-admin.html `teamMemberIds/teamUids/teamNames.slice(0, 30)` | **H&S step 5** (events) |
| **30 audiences** | egbc-events.js (Firestore's 30 per "any of" query) | **H&S step 5**: asked in batches of 30, so no limit |
| 20 teams, 50 members, 30 welcomers | rules | **H&S step 2**, where they're mine; any that are main's I'll pass on |
| 40 risks, 40 host questions, 20 controls a risk | rules, egbc-sg-assess.js, sg-ai-core.cjs | **S2** (see note) |
| 100 warnings, 50 kids' groups' consent | functions/sg-warnings*.js | **S5** |
| 10 people responsible for a check, 10 files, 200 history rows | rules, egbc-compliance-store.js, compliance.html | **H&S step 3** |
| AI per day: 20 for the church, 5 a person, set no higher than 200 or 50 | already a setting; only the maximums are fixed | **S2**: the maximums go |

- **The note on records:** one Firestore record holds at most 1 MB. A list stored inside one record (an assessment's risks, a host's questions) needs some ceiling. In S2 these become a high technical ceiling, not a church-size rule, and the page says so when it's reached instead of cutting the list silently.
- **Lists of people** (leaders, wardens, team members) go to no limit, by storing them so they don't all sit in one record or one query.

**How S1 works for the synthetic parish** (St Aidan's with St Hild, Testbury):
- **Nothing in it is EGBC's or Baptist.** The rule is about UK sockets, so it holds for any UK church. It is the same for their choir trip, youth camp and holiday club drafts, and for any host's list.
- **Nothing in it is a setting,** and nothing needs to be: no team, no number, no name.

**Already built that would fail the parish test** (beyond the two tables above), with the step that fixes each:

| What the parish would see | Why it fails | Fixed in |
|---|---|---|
| **"Safeguarding lead" and "lead or deputy" throughout** the safeguarding pages, the print's signature lines and sign-off role | **The parish has a "Parish safeguarding officer".** The role's name becomes a church setting (default "Safeguarding lead") | **S2** (the page wording), S4 (the print and "trustees noted") |
| **"Ask the church office"** in the AI's messages | **They have a "Parish office".** It will take the office job's team name from main's mapping | **S2** |
| **No denomination guidance;** the AI isn't told the church's tradition | **They follow the Diocese's guidance.** This is (e), a setting | **S2** |
| **The employees question is a yes/no** for each building (egbc-compliance-templates.js) | **They have about 30 employees.** It becomes a number for the church, and the duties follow it | **H&S step 2** |
| **No bells, tower, churchyard, listed building or candles** in the building profile or starter hazards | **Their parish church has all of these.** They are added as profile questions and starters (working at height, the tower, memorials, headstones, heritage, naked flames) | **H&S step 3** |
| **No weddings, baptisms or funerals** as kinds of event assessment | **They run all three.** They are added to the event kinds (numbers, candles, the font and water, the churchyard, traffic) | **H&S step 5** |
| **The fire roll-call is one record for the whole church** | **They have three buildings.** It becomes one for each building | **H&S step 3** |
| **The office reads at most 3 sites** | **This works for their 3, but not a 4th.** It becomes a lookup by site | **H&S step 2** |

**No change to live** except the reviewing window's deploy of the two functions.

**S1's breaks** (each caught):

| Break | sg-ai | sg-host | Caught by |
|---|---|---|---|
| **THE ONE THAT MATTERS:** the server check removed | 68/73 | — | "never reaches the database", "what was sound stays", "counted: 8" |
| the same, on the host's list | — | 27/29 | "left out (1 of 2), and counted", "the leader is told" |
| the instruction left out of the drafts | 72/73 | — | "the instruction is in what was sent" |
| the instruction left out of the host's list | — | 28/29 | "the instruction is in what was sent" |
| a hazard left with no control kept anyway | 69/73 | — | "never reaches the database", "what was sound stays", "counted: 8" |
| the page doesn't say what was left out | 72/73 | — | "THE PAGE SAYS SO" |
| the host box doesn't say | — | 28/29 | "the leader is told" |

**Tests:** sg-ai 73/73, sg-host 29/29.

## From the main window, 25 Oct 2026: a service's plan is found by its service now (H-11 item 0, c08109b9)

- **The bug it fixes:** a plan in `services` used to be found by its date alone, so two services on one date shared one plan, and saving the second overwrote the first.
- **Now:** each plan carries `eventId` (its rota event). The emailed plan (`songSummaries`) is named by the date alone with one service that day, and `<date>_<eventId>` with several.
- **Use the one helper, `EGBCPlanStore`** (`v2/egbc-plan-store.js`; load it before your script). Never take "the first plan with this date". Read the day's plans with `where('date', '==', date)`, then call:
  - `EGBCPlanStore.planFor(docs, eventId, dayEvents)`: this service's plan, with docs as `[{ id, data }]`;
  - `EGBCPlanStore.inOrder(events)`: the day's live services in time order (archived ones don't count);
  - `EGBCPlanStore.summaryId(date, eventId, dayEvents)`: the emailed plan's name.
- **Yours to switch:**
  - **the events window:** Present, wherever a deck finds its service's plan by date;
  - **Comms:** the e-news "This Sunday", and sitemaker.html where it reads services.
- **A date with one service** (EGBC almost every week) behaves exactly as before.
- **The check:** tests/check-two-services.mjs shows the pattern (two services on one date; a break with the old rule).

### F-282 — Safeguarding step 2a: a camp or festival kind; behaviour, accessibility, visitors and "a male and a female leader" on every event; transport and the insurance amount; the church's own guidance (the events window, 25 Oct)

**Step 2 is in two parts.** About 60 places in 16 files say "safeguarding lead", so S2b does the role's name as a setting and the 500 limits on its own.

**Built:**
- **A camp or festival** (F-280 10.1, answers 13 and 14):
  - **What it asks:** a new kind, with 11 questions of its own (tents and spacing, fire in tents, cooking and fuel, Level 2 food hygiene, the night tent check and where adults sleep, a medical officer, adults' health forms, the site's rules, vehicles, leaving the site, set-up day) **plus the 4 overnight questions**: 33 in all with the core.
  - **Its 11 starter risks** include fire in a tent, carbon monoxide, guy lines, a vehicle on site, someone lost in a crowd, and an adult's own health emergency. Our own words.
  - **Like every other kind,** it needs the lead's or deputy's sign-off when under-18s go. It is chosen on events-admin ("A camp or festival").
- **Four new questions on every event** (answer 16; signed assessments are untouched):
  - **Behaviour,** including the host's policy or code of conduct
  - **Accessibility**
  - **Visitors and members of the public**
  - **"Is there at least one male and one female leader?"** answered Yes, No or "Not a mixed group", which needs no words. A No is flagged amber on the page, the print and the warnings. **Nobody's sex is recorded,** only the answer.
- **Transport** now asks about roadworthiness (an MOT, a check before the journey), drivers' hours and rest breaks, and a minibus only with the right licence (D1, or a permit).
- **Insurance** has an amount box for the public liability cover, saved as "£5,000,000: <words>".
  - **Flagged amber** when it is under the church's minimum, or when no amount is given.
  - **The minimum is a setting** on Safeguarding settings (£1 million unless changed).
- **The church's own guidance** (F-280 (e)): a name and an https link on Safeguarding settings.
  - **Where it shows:** "This church follows …" above every checklist, with NSPCC Learning for everyone, and "Guidance followed" in the print.
  - **The AI is told its name.**
- **One set of rules for the answers that are flags** (`answerFlags`): no paediatric first aider, no male and female leader, and the cover. The page, the print and the daily warnings all use it.
- **The server's copy of the checklist is now generated:**
  - **The script:** screenshots/events/sg-checklist-gen.mjs. Before, the file only said it was, and they could drift.
  - **The unit test checks** the copy is current and that the rules ask for the same ids.
- **The kinds list:** where a page or function loads the templates, it reads the list from there (safeguarding.html, safeguarding-risk.html, sg-print.html, sg-ai.js, sg-warnings.js). That is 5 copies fewer.
- **The AI's daily limits can be set up to 500** (they were capped at 200 and 50).

**Rules:** the camp kind in `sgNeedsSignoff`; the four new core ids and the camp's list (with the overnight ids) in `sgChecklist`. Built rules are regenerated, and check-rules-build passes 8/8.

**Deploy (the reviewing window's):** sgDraftAssessment, sgExtractRequirements, sgWarningsSync, sgWarningsNow, sgTwoAdultsDaily (they read the checklist, the kinds and the flags). The rules go live when the hub goes live.

**For the synthetic parish:**
- **Their youth camp:** it is a "camp or festival". It gets 33 questions, the overnight ones included, and the parish safeguarding officer signs it off.
- **Their guidance:** they enter their diocese's guidance on Safeguarding settings. It shows on every assessment and print, and the AI is told it.
- **Their choir trip abroad** gets the transport and £1 million cover questions. If their insurer requires more, they set their own minimum.
- **Nothing here names EGBC, a team or a Baptist habit.**
- **Still EGBC-shaped** (fixed in S2b): "safeguarding lead" in the wording. The parish says "Parish safeguarding officer".

**Found and not fixed:**
- tests/check-mail-route.mjs stops at the start because firebase.comms.json (the Comms window's) isn't in this clone. Not caused by this step.
- The database refuses a sign-off with "Yes: " and nothing after, but not "£5,000,000: " with nothing after. The page refuses both. The rules can't test the shape of an answer cheaply.

**Breaks** (13, each caught):

| Break | Test | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** the rules forget the four new core questions, so a lead could sign with them blank | sg-ai-unit 66/67 | "THE RULES require the same ids: the core" |
| a camp doesn't need the lead's sign-off | sg-ai-unit 66/67 | "and the rules need its sign-off" |
| the rules forget a camp's overnight questions | sg-ai-unit 66/67 | "A CAMP OR FESTIVAL: its own questions, then the overnight ones" |
| the page forgets a camp is an overnight too | sg-ai-unit 65/67 | "a camp 33"; "generated from the page's" |
| the server's copy not regenerated after a change on the page | sg-ai-unit 65/67 | "the same questions, word for word"; "generated" |
| no flag for "no male and female leader" | sg-ai-unit 66/67 | "THE FLAGS …" |
| the church's own minimum cover ignored | sg-ai-unit 66/67 | "the church's own minimum counts" |
| the AI isn't told the church's guidance | sg-ai-unit 66/67 | "THE CHURCH'S OWN GUIDANCE goes to the AI" |
| the warnings leave out the checklist's other flags | sg-warnings-unit 60/61 | "each is a warning, amber, … nobody's sex in it" |
| "Not a mixed group" isn't saved | sg-assess 22/24 | "saved: …"; the run stops |
| the cover amount isn't saved | sg-assess 37/39 | "the cover as an amount"; "COVER UNDER £1 MILLION is flagged" |
| the page shows no flag at the question | sg-assess 38/39 | "COVER UNDER £1 MILLION is flagged amber at its question" |
| the print shows no flag for the mixed group or the cover | sg-print 39/42 | "NO MALE AND FEMALE LEADER … flagged Medium"; "COVER UNDER £1 MILLION: flagged Medium" |

**Tests:**

| Test | Result | Change |
|---|---|---|
| sg-assess | 39/39 | 5 new checks |
| sg-print | 42/42 | 3 new |
| sg-ai | 73/73 | |
| sg-host | 29/29 | |
| sg-ai-unit | 67/67 | 9 new |
| sg-register-unit | 17/17 | |
| sg-warnings-unit | 61/61 | |
| rules suite | 1902/1902 | 2 new: no sign-off with behaviour or the mixed-group question blank |
| check-rules-build | 8/8 | |

Earlier tests updated for the new counts: a trip asks 18, not 14.

### F-283 — Present and main's EGBCPlanStore (H-11 item 0): nothing to switch; check-mail-route skips plainly without Comms' emulator file (the events window, 25 Oct)

**Present and EGBCPlanStore:**
- **Present never finds a service's plan by date,** so there is nothing to switch.
  - It shows a group's sessions (`planSessions`, found by group and by id) and a meeting's deck (`presentDecks`, by id).
  - None of egbc-present.js, present.html or present-guide.html reads `services` or `songSummaries`.
- **The files that read `services` by date are main's** (CoreTeamApp.html, app.html, hub-app.js, egbc-core-planner.js, worshiphubapp.html, youthapp2.html, Library.html, sundayplannersonglibrary.html, data-tools.html) and Comms' (sitemaker.html).
- **Found while looking, for H-9's audit** (present.html, the Menu's "your groups' sessions" chooser):
  - **It shows only the next 12 sessions** (`slice(0, 12)`).
  - **It looks up groups by team *name*, at most 10 teams** (`teams.slice(0, 10)`, `teamName in [...]`).
  - Both wait for main's jobs mapping (team ids, not names). The 10 becomes batches of 30, and the 12 becomes "show more".
  - **Fixed in:** S2b's sweep of the 500 limits, once main's mapping is in.

**check-mail-route.mjs** (main's tests/ file, changed at the reviewing window's request):
- **Without firebase.comms.json** it now says "SKIPPED: firebase.comms.json is not in this clone…", with how to run it, and exits cleanly instead of stopping with a file error.
- `EGBC_FIREBASE_CONFIG` still points it at another emulator.

**For the going-live list:**
- **The rules can't check an answer's shape:** they refuse "Yes: " or "No: " with nothing after, but not "£5,000,000: " with nothing after (the insurance cover alone).
- **The page refuses it,** which the reviewing window accepted (F-282).

### F-284 — Safeguarding step 2b: what the church calls its safeguarding lead, as a setting; the 500 limits in the safeguarding files (the events window, 25 Oct)

**What the church calls its safeguarding lead:**
- **The setting:** Safeguarding settings, "What your church calls its safeguarding lead" (`register.leadTitle`). Empty means "safeguarding lead", as now.
- **How it reaches every page:**
  - **One place:** egbc-events-safeguarding.js (`lead`, `leadIn`, `leadWatch`). Every safeguarding page already loads it: safeguarding, safeguarding-risk, safeguarding-settings, sg-print, events-admin, checkin and groups-admin.
  - **When it starts:** once someone is signed in, it reads the setting and swaps "safeguarding lead" for the church's title in everything the page shows, including what it draws later and the server's messages.
  - **What it changes:** text only, never an id or an attribute. Its own setting's field is left as written (`data-nolead`).
- **It is safe to run twice,** even when the title itself says "safeguarding lead" ("Designated safeguarding lead" is never doubled). It leaves "safeguarding leader" alone, and capitalises where a sentence starts with it.
- **A sign-off saves the role in the church's words** (`signedByRole`: "Parish safeguarding officer", or "Deputy Parish safeguarding officer"), so the print shows them.
- **The AI is told the title,** so the owners its draft names use it.
- **Why one swap and not 35 edits:** about 35 places in 16 files say "safeguarding lead" in words people see. A swap at one point keeps the code readable, can't miss a message the server sends, and keeps the next new sentence right without anyone remembering to.

**The 500 limits in the safeguarding files** (H-9: no limits beyond what a record holds):

| What | Was | Now |
|---|---|---|
| Risks in one assessment (one record, at most 1 MB) | 40 | 200 |
| Controls per risk | 20 | 50 |
| The host's questions | 40 | 500 |
| The church's own questions | 20 | 500 |
| Answers | 80 | 1,100 (they add up from the lists above) |
| Warnings kept | 100 | 500 |
| Sessions and consent groups on the dashboard | 100 / 50 | 500 |
| A register snapshot's risks | 200 | 500 |
| The AI's "must not" lines and questions | 10 | 50 |

- **The page, the server (`MAX` in functions/sg-ai-core.cjs) and the rules agree,** and a unit test checks it.
- **When a list is full the page says so:**
  - "An assessment holds at most 200 risks. Join two together, or take one out first."
  - The same for a risk's controls, the host's list, and the church's own questions.
- **Fixed in later steps** (as F-281 said):
  - the 60 fire wardens (H&S 3)
  - the event leaders and other people lists (S3)
  - the office's 3 sites (H&S 2)
  - the event team and audiences (H&S 5)

**Also:**
- **The kids setup step no longer says "Kids Church, for example"** (egbc-events-kids.js). It now says "choose the team that runs the children's groups".

**For main:**
- app.html loads egbc-events-kids.js at 202610141700; please bump it to 202610251400.
- **Waiting for your jobs mapping** (the children's and youth jobs):
  - kids-admin.html's fixed list of EGBC's teams (`STD = ['Kids Church', 'Lazers', 'ReNu', 'Youth Worship']`)
  - kids-checkin.html's "the app's Kids Church "Today""
  - the kids pages' "A master admin or the safeguarding lead does this" (those pages don't load the safeguarding file)

**For Comms:**
- check-rules-build.mjs is now 7/8: firebase.comms.json (committed in 4b60a1f2) loads `firestore.rules`, not the built `firestore.build.rules`. Every other emulator config loads the built file.

**For the synthetic parish:**
- **Their title:** they enter "Parish safeguarding officer". Every safeguarding page, print and sign-off says it, and the AI uses it.
- **Their size:** a large youth camp can carry up to 200 risks, and they can add up to 500 questions of their own. Nothing is cut short without the page saying so.

**Breaks** (7, each caught):

| Break | Test | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** the pages never put the church's title in | sg-assess 39/42 | "8. THE CHURCH'S OWN TITLE"; "'safeguarding lead' nowhere on the page"; "SIGNED as …" |
| the sign-off saves "Safeguarding lead", not the church's title | sg-assess 41/42 | "SIGNED as 'Parish safeguarding officer (invented)'" |
| a title that says "safeguarding lead" doubles itself | sg-register-unit 22/23 | "never doubled, however often it runs" |
| "safeguarding leader" changed too | sg-register-unit 22/23 | "'leader' untouched" |
| the AI isn't told the church's title | sg-ai-unit 67/68 | "THE CHURCH'S TITLE … goes to the AI" |
| the rules back to 40 risks | sg-register-unit 22/23 | "the page, the server and the rules agree" |
| the page cuts risks silently at the limit | sg-register-unit 22/23 | "the page says so when a list is full" |

**Tests:**

| Test | Result | New checks |
|---|---|---|
| sg-assess | 42/42 | 3 (the parish's title) |
| sg-print | 42/42 | |
| sg-ai | 73/73 | |
| sg-host | 29/29 | |
| sg-dash | 45/45 | |
| e3-safeguarding | 38/38 | |
| sg-register-unit | 23/23 | 6 |
| sg-ai-unit | 68/68 | 1 |
| sg-warnings-unit | 61/61 | |
| rules suite | 1903/1903 | "up to 50 controls" allowed, a 51st refused |
| check-rules-build | 7/8 | the one failure is Comms' file (above) |

**Deploy (the reviewing window's):** sgDraftAssessment, sgExtractRequirements, sgWarningsSync, sgWarningsNow, sgTwoAdultsDaily. The rules go live when the hub goes live.

## From the main window, 26 Oct 2026: a safeguarding assessment written by a named leader is over Firestore's 1,000-expression limit in the church ruleset (H-8)

- **The F-279 rerun:** `AS_CHURCH=mc-test node firestore-rules.test.mjs` is 1898/1909. Your F-279 headroom cleared both office booking cases. Thank you.
- **10 of the 11 reds are users self-writes**, refused in a church by design (the server writes those records there).
- **The 11th is new, from F-282/F-284:** "and its named leaders": `sgAssessments/{calEventId}` create or update by a leader in `eventLeaders.leaderUids`.
  - In the church ruleset it stops at "maximum of 1000 expressions" (`firestore.churches.rules` L1226, the `allow create, update`).
  - EGBC's own run is 1909/1909, so nothing is broken today. It would be when the hub goes live for a second church.
- **Asked:** headroom in that `allow`, as F-279 did for booking (for example, read `eventLeaders` and the event once, in a `let`, or check the leader before the field checks). Then rerun `node tools/rules-build.mjs` and the `AS_CHURCH` run above; the target is 1899/1909 (only the 10 by design).
- **For the synthetic parish:** St Aidan's youth leaders, named on a trip, write the trip's assessment. Today that would be refused.

### F-285 — Headroom in writing a safeguarding assessment, in the church ruleset (main's 20a9aa4f run; as H-8) (the events window, 26 Oct)

**The problem** (main, 20a9aa4f):
- **A named leader writing an event's assessment went over Firestore's 1,000-expression limit in the church ruleset.** That ruleset is used by every church after EGBC.
- **EGBC's own ruleset passed with no room at all.** Measured: 10 spare expressions pushed a leader's draft over.

**The fix** (firestore.rules, the EVENTS section):
- **The assessment's checks are now one function,** `sgAssessOk(calEventId, d, before, ev, lead)`:
  - The new data and the old are passed in once, instead of `request.resource.data` written out about 40 times.
  - **The event is read once.** Before, it was read for its site and again for its kind.
  - **"Is this the site's lead or deputy?" is worked out once.** Before, it was worked out up to three times in one write: who may write, signing, "not needed".
- **The writers are tried cheapest first:**
  1. the lead (already known)
  2. a named leader (one read)
  3. the event's team
- **`sgChecklistDone` takes the event's kind** rather than reading the event again.
- **Nothing about who may do what has changed.** The rules suite proves it, as before.

**Headroom, measured** (screenshots/events/sg-headroom.test.mjs, new). Every way an assessment is written, against both built rulesets, with spare expressions added to `signedIn()`:
- **The writes:** a leader's draft, the organiser's, the lead's sign-off and "not needed", and three refusals (a leader signing, a stranger, a blank sign-off).
- **Results:**

  | | Before | After |
  |---|---|---|
  | EGBC's ruleset | 0 spare | at least 20 |
  | The church ruleset | over the limit at 0 | at least 20 |

  At 40, the organiser's draft reaches the limit.

**Breaks** (each caught by the headroom test):

| Break | Result |
|---|---|
| **THE ONE THAT MATTERS:** the writers checked in the old order (the lead's reads first) | 0/6 |
| anyone signed in may write it | 0/6 (a stranger's draft goes through) |

**Tests:**

| Test | Result |
|---|---|
| sg-headroom | 6/6 |
| Rules suite, EGBC's ruleset | 1909/1909 |
| Rules suite, `AS_CHURCH=mc-test` | **1899/1909**: main's target; the 10 are users' own-record writes, refused in a church by design |
| check-rules-build | 9/10; the red is Comms' firebase.comms.json (main has asked them) |

**For the synthetic parish:** St Aidan's youth leaders, named on a trip, can now write the trip's assessment, with room to spare.

**Deploy:** none. The rules go live when the hub goes live.

### F-286 — Safeguarding step 3: leader checks (the DBS level with the children's barred list, a church leader's reference, the confidential declaration, "has read the host's safeguarding policy"); no limit of 20 leaders (the events window, 26 Oct)

**Built:**
- **A leader's checks** (each leader's own record, `leaderChecks`; the "Checks" form on an event's safeguarding page):
  - **The level of the DBS check:** "Enhanced, with the children's barred list", "Enhanced, without the barred list", Standard, Basic, or not recorded.
  - **The date a church leader's reference came.**
  - **The date of the confidential declaration.**
  - **References and declarations last 3 years** (a setting on Safeguarding settings).
- **Each leader's row shows three more chips:**
  - **The barred list:** flagged on an under-18s event when the check isn't Enhanced with the barred list, or the level isn't recorded.
  - **Reference:** in date, missing or out of date.
  - **Declaration:** the same.
- **"Cleared" is still DBS and training only.** It's what the rules check before a leader can be named on an under-18s event, so nothing that works today stops working.
- **The assessment's "leaders" question** shows the hub's counts: "1 without an Enhanced check with the barred list recorded; 1 without a reference in date; 1 without a declaration in date". Counts only.
- **The daily warnings** (amber, counts only): leaders on under-18s groups and events without the barred list recorded, without a reference in date, and without a declaration in date. Each has what to do.
- **"Has each leader read <host>'s safeguarding policy?"**
  - **On the assessment, when the event has a host:** a tick and a date for each leader. Amber until every leader has ticked.
  - **On the print,** the count: "Read Hilltop Christian Camp (invented)'s safeguarding policy: 1 of 1 leaders."
  - **It's its own record** (`sgPolicyReads/<event>`), written and read by those who write the assessment. **Nothing new is in the assessment's own rule,** as asked.
- **No limit of 20 leaders on an event:**
  - **Why there was one:** the rules checked one by one that `leaderIds` matched `leaders`, 20 times over.
  - **Now:** `leaderIds` is who each leader is. The pages read leader i's member id from `leaderIds[i]` (`SG.leadersOf()` → `whoIs()`), so the rules check only that the two lists are the same length (up to 500) and that nobody appears twice.
- **The other leader lists in the rules: 500** (H-9):
  - a kids group's leaders (30)
  - the kids morning (60)
  - a small group's leaders (10), and its capacity (200)
  - a session plan's group leaders (30), and who's on and away (40)
- **groups-admin.html's check save now merges,** so it no longer wipes the level, reference and declaration.

**Headroom** (asked for after F-285): sg-headroom.test.mjs against both built rulesets, at the end of S3. **At least 20 spare expressions in each, unchanged.**

**Breaks** (10, each caught):

| Break | Test | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** the rules back to 20 leaders on an event | rules 1925/1926 | "S3 MANY: 25 LEADERS NAMED ON AN UNDER-18s EVENT" |
| one person named twice | rules 1924/1926 | "§24: nor by a member id list that says someone else"; "nor one person twice" |
| any DBS level accepted | rules 1925/1926 | "not a level that isn't one of the DBS levels" |
| anyone signed in may record who has read the host's policy | rules 1923/1926 | "a volunteer not on the event can't write it" and two more |
| who each leader is taken from leaders[i] again | sg-register-unit 29/30 | "WHO EACH LEADER IS comes from leaderIds" |
| an Enhanced check without the barred list counted as enough | sg-register-unit 29/30 | "the barred list: 'ok' only for Enhanced with the barred list" |
| the warnings leave out the barred list | sg-warnings-unit 63/64 | "2 without the barred list …" |
| the page shows no barred-list, reference or declaration chips | sg-assess 43/44 | "A LEADER'S OTHER CHECKS" |
| the host's policy box never shows | sg-host 28/29 | the run stops at "10." |
| the print leaves out who has read the host's policy | sg-host 31/32 | "THE PRINT: 'Read Hilltop … 1 of 1 leaders.'" |

**Tests:**

| Test | Result | New checks |
|---|---|---|
| sg-assess | 44/44 | 2 |
| sg-host | 32/32 | 3 |
| sg-print | 42/42 | |
| e3-safeguarding | 38/38 | the record's fields now include the three new ones |
| sg-ai | 73/73 | |
| sg-register-unit | 30/30 | 7 |
| sg-warnings-unit | 64/64 | 3 |
| sg-ai-unit | 68/68 | |
| rules suite, EGBC | 1926/1926 | 13 |
| rules suite, as a church | 1916/1926 | the 10 are the users' own-record writes, by design |
| sg-headroom | 6/6, at least 20 spare in both | |
| check-rules-build | 10/10 | |

**Found and not fixed:**
- **An admin or the site's lead could still write a leader's name beside someone else's member id.** The page would then show that name with the other person's checks.
  - **What is safe:** clearing works on the ids, so an uncleared person can't count as cleared.
  - **The fix:** keep each leader's name and role keyed by member id (`leaderInfo`), which the rules can compare with `leaderIds` as a whole. That changes how leaders are stored, so it's left for the reviewing window's word.
- **Marking a small group under-18s clears at most three leaders in that save.** The page says so, and more are added one at a time. That's a per-save step, not a limit on how many leaders a group has.
- **On going live,** EGBC's leaders have no level, reference or declaration recorded yet. The warnings will show them all amber until the office records them. That's right, but expect it.

**For the synthetic parish:** a youth camp with 30 leaders is fine (it was refused over 20). Their safeguarding officer records each leader's check level, reference and declaration, and leaders tick that they've read the camp's own policy.

**Deploy (the reviewing window's):** sgWarningsSync, sgWarningsNow, sgTwoAdultsDaily (the new warnings), and sgDraftAssessment and sgExtractRequirements (they share the checks file). The rules go live when the hub goes live.

### F-287 — Each leader's details kept by member id, so a name can never sit beside someone else's checks (Martin: yes, 26 Oct); the migration (the events window, 26 Oct)

**The gap (F-286):** an admin or the site's lead could write one leader's name beside another member's id, and the page would show that name with the other person's checks.

**The fix:**
- **`leaderInfo`** on each event's leaders record keeps each named leader's name, role and sign-in by member id.
- **The rules hold it to exactly the record's member ids, on every event:** no extra, none missing, nobody twice (`leadersShapeOk`).
- **The pages show a member's name from `leaderInfo`, never from `leaders[i]`** (`whoIs()`: the assessment page, the print, clearing in turn).
- **Someone not in the address book** ('' in `leaderIds`) has no checks to stand beside, so they stay in `leaders` only.
- **`leaders` and `leaderIds` are kept as before.** The pages write `leaderInfo` beside them (`putLeaders`).
  - If the rules live on the hub today don't know `leaderInfo`, the same save is tried once without it, so live /v2/ pages keep working until the new rules go live.
  - The new rules refuse that second try, so nothing is weakened where it matters.
- **An older record gains `leaderInfo` the next time a page saves it** (`shapeOf`): adding or removing a leader, the under-18s tick, clearing in turn, or "apply to the ones already made" on Safeguarding settings.

**The migration** (screenshots/events/migrate-leader-info.mjs):
- **It lists before it changes anything,** and changes nothing without `--write`.
- **What it changes:** it adds `leaderInfo` to each event's leaders record, and `leaderIds` where an older record has none. Nothing else changes.
- **What it leaves for a person:** a record that names the same member twice is listed and left alone.
- **On the emulator** (synthetic records, leader-info-migrate.test.mjs, 11/11):
  - 5 records: 3 changed (one with no `leaderIds`, one with nobody), 1 already right, 1 for a person.
  - Run again, nothing more to do.

**For the reviewing window: the live run**
- **When:** at the same time as the new rules go live, not before. The rules live today don't know `leaderInfo`, and would refuse every later save of a migrated record.
- **List first, then run** (the list shows each record's leaders and member-id counts, and any for a person):

        node screenshots/events/migrate-leader-info.mjs --project egbc-worship-planner
        node screenshots/events/migrate-leader-info.mjs --project egbc-worship-planner --write

- **For a church after EGBC,** add `--church <cid>`.

**Headroom:** at least 20 spare expressions in both rulesets (sg-headroom), unchanged.

**Breaks** (5, each caught):

| Break | Test | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** the pages take a member's name from leaders[i] again | sg-register-unit 32/33 | "A MEMBER'S NAME COMES FROM leaderInfo" |
| the rules let leaderInfo name someone not named | rules 1936/1937 | "nor details for someone not named" |
| the rules no longer check leaderInfo at all | rules 1932/1937 | three refusals |
| the migration writes without --write | migrate 9/11 | "WITHOUT --write NOTHING CHANGES" |
| the migration "fixes" the same member named twice by itself | migrate 6/11 | "FOR A PERSON ev_twice …" |

**Tests:**

| Test | Result |
|---|---|
| leader-info-migrate | 11/11 (new) |
| e3-safeguarding | 38/38 |
| under18 | 20/20 (see below) |
| event-team | 21/21 |
| phone-fixes | 24/24 |
| sg-assess | 44/44 |
| sg-host | 32/32 |
| sg-print | 42/42 |
| sg-register-unit | 33/33 (4 new) |
| rules suite, EGBC | 1937/1937 (4 new) |
| rules suite, as a church | 1927/1937 (the 10 by design) |
| sg-headroom | 6/6 |
| check-rules-build | 10/10 |

**Also fixed:** under18.test.mjs's "6. REMINDERS" expected a team admin to see everyone's DBS dates. Since 22 Oct (e6edc276) only the master admin and each site's lead and deputy do, so the check now uses the master admin. The page was right; the test was out of date.

**Deploy:** none (no function changed). The rules go live when the hub goes live, with the migration above.
## From the main window, 26 Oct 2026: core teams cover chosen teams (H-15). Four rules of yours read a person's own teams only

**What changed (H-15, decided by Martin):**
- Any team can be ticked "core team for" chosen teams on Teams & groups (`teams/{id}.coreFor`). Being on it counts as being on those teams, and nothing else.
- EGBC: Core Team (the Worship Core Team) covers Worship, AV and Choir, as before. A new **Kids & Youth Core Team** covers Kids Church, Lazers, ReNu and Youth Worship, and works with under-18s.
- In the rules, `myTeams()` now adds `covers` from the person's users record. The server writes it (functions/core-teams.js), and no page can.

**Asked of you:** these four use `me().get('teams', [])` directly, so a core team's cover doesn't reach them:
1. **firestore.rules ~4940, `readsPlanGroup(gid)`:** `planGroup(gid).get('teamName', '-') in me().get('teams', [])`.
2. **~4945, `match /planGroups/{gid}` read:** `resource.data.get('teamName', '-') in me().get('teams', [])`.
3. **~1750, `canSeeEvent()`:** `eventAudience().hasAny(me().get('teams', []))`.
4. **~1963:** `a.hasAny(me().get('teams', []))`.

Each could use `myTeams()` (or `me().get('teams', []).concat(me().get('covers', []))`, which costs less). With 1 and 2 changed, a Kids & Youth Core Team member sees Kids Church's Session planner and Present, as Martin wants. Until then they can't read the session groups.
- **Check:** `tests/check-core-teams.mjs` has two cases waiting on this, labelled "(needs the events window's planGroups rule)". The rules suite has room for a case of yours: a user with `covers: ['Kids Church']` reads a plan group whose `teamName` is 'Kids Church'.
- **Also yours, for H-15:** the Menu's `core: true` entries for Events, Check-in and Registers now mean "on any core team" (with admin, as before), so a Kids & Youth Core Team admin gets them too. Say if they should be narrower.

### F-288 — The going-live tidy-ups; core teams' covered teams in my rules and pages (main's H-15); safeguarding step 4: "still to do" and "trustees noted" (the events window, 26 Oct)

**1. Tidy-ups (the reviewing window's)**
- **The migration script has moved** to `v2/tools/migrate-leader-info.mjs`, with the other going-live scripts. Its test stays in screenshots/events and points at the new place (11/11).
- **GOING-LIVE.md (main's file, at the reviewing window's request):** one item in "With the rules": the leaders migration, at the same moment as the Firestore rules (list, check, then `--write`), run by the reviewing window. **For main:** please keep it there.
- **SWITCHOVER-events.md, Part 1:** the same step, item 4.

**2. Core teams cover chosen teams (main's H-15, F-from-main 26 Oct)**
- **My rules now count a person's covered teams** (`teamsCovered()`: own teams plus `covers`, which the server keeps on the users record, main's cheaper form of `myTeams()`). That's every place they read only a person's own teams:
  - the session planner's groups (`readsPlanGroup` and `planGroups` read), so the Session planner and Present
  - events for a team (`canSeeEvent`, `audienceOk`)
  - the Maintenance team
  - the money team
  - a meeting's hosts (and its admins through main's `adminCovers`)
- **My pages:**
  - present.html and session-planner.html look groups up by own and covered teams, asked in 30s with no limit (it was 10). Present's "not yours" check counts covered teams too.
  - egbc-events.js asks for events for covered teams.
- **The rules suite** (7 new checks):
  - **A Kids & Youth Core Team member** (`covers: ['Kids Church', …]`) reads Kids Church's session group, finds it by its team, reads its plans, and sees a Kids Church event.
  - **A Worship Core Team member** reads none of them.
- **Main's tests/check-core-teams.mjs was NOT run:** another window's dev emulator holds its ports (8181, 9099) all evening, and I don't stop another window's emulator. The rules suite covers the same two people at the rules' level. **Please run check-core-teams** (or I will when the ports are free); its two waiting cases should now pass.
- **Headroom, measured after:** sg-headroom at least 20 in both rulesets; H-8's booking at least 80 (a four-part hall at least 40). Both unchanged.
- **For main:**
  - egbc-events.js is 202610262000 on my pages. Please bump it on yours and Comms': app, cardmaker, comms, giftaid, give-regularly, my-messages, newhere, payments, picture-library, prayer, rota-reports, team-mail.
  - **session-planner.html is shared:** I changed only its `loadGroups()`.

**3. Safeguarding step 4: "still to do" and "trustees noted"** (F-280 10.4, Martin's answers 17 and 18)
- **"Still to do" (Derby's steps 4 and 5).** Each risk can have up to 5 actions: what, who (a person or a role), by when, and done or not.
  - **On the event's assessment:** add them on each risk; they show on the risk, with "overdue" once their date has passed.
  - **On the standing register:** the same in the risk editor, and in the register's dated snapshots.
  - **Sign-off (answer 17):** open actions may stay, each with a person and a date. The page refuses sign-off while one has no person or date ("Give each open 'still to do' a person and a date first (1 without).") or sits on a risk still High after its controls ("… finish it, or bring the risk down, first.").
  - **The print** has a "Still to do" table: the risk, the action, who, by when, overdue, done.
  - **The daily warnings:** "N still-to-do actions are past their date" (amber, counts only).
  - **The assessment's own rule is unchanged** (headroom). The standing risks' rule allows `todo`, up to 5.
- **"Trustees noted" (answer 18).**
  - **Who and when:** after sign-off, a trustee (the trustee team, a setting) or a master admin records that the trustees have noted it, from the register's Events, "Read it". It shows: "Trustees noted on <date>, by <name>."
  - **It never stops the event.** Until it's done: "Waiting for the trustees to note it. It doesn't stop the event."
  - **Which kinds:** a church setting on Safeguarding settings, by default camps, overnights, anything overseas, and anything adventurous.
  - **It's its own record** (`sgNoted/<event>`), for the signed version only, so it resets if the assessment is signed again. The rules: the trustee team or a master admin, as themselves, now, only once signed, only for the signed version.
  - **The print** says "Trustees noted on … by …" or "Not yet noted by the trustees". **The warnings** say "Signed off, but the trustees have not noted it yet" (amber).
- **Shared:** `T.todoState()` and `T.needsNoted()` in the templates; the server's copy is generated (sg-checklist-gen.mjs).

**Breaks:**

| Break | Test | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS (S4):** signed off with an open "still to do" that has no person or date | sg-assess 52/53 | "NOT SIGNED while an open one has no person and date" |
| signed off with something still to do on a risk still High | sg-assess 46/48 | "NOT SIGNED while a risk still High has something to do" |
| anyone signed in may record "trustees noted" | rules 1965/1966 | "the organiser can't" |
| "noted" for any version | rules 1965/1966 | "nor for a version that wasn't the one signed" |
| a standing risk with any number of actions | rules 1965/1966 | "not 6" |
| an overdue action not counted | sg-register-unit 36/37 | "todoState: …" |
| the print leaves out "still to do" | sg-assess 52/53 | "THE PRINT: 'Still to do'" |
| the trustees-noted line never shows | sg-assess 48/49 | the run stops at the noted check |
| the register's editor saves an action with no person or date | sg-register 25/27 | "refused without a person and a date" |
| **THE ONE THAT MATTERS (H-15):** the plan-group rules read own teams only | rules 1963/1966 | "A KIDS & YOUTH CORE TEAM MEMBER READS KIDS CHURCH'S SESSION GROUP" and two more |
| events for a team read own teams only | rules 1965/1966 | "the Kids & Youth Core Team member sees it" |
| covered teams for everyone | rules 1957/1966 | "A WORSHIP CORE TEAM MEMBER DOES NOT" and two more |
| (the same plan-group break, against main's check-core-teams) | not run | the dev ports were taken |

**Tests:**

| Test | Result |
|---|---|
| sg-assess | 53/53 (9 new) |
| sg-register | 27/27 (2 new) |
| sg-print | 42/42 |
| sg-dash | 45/45 |
| sg-host | 32/32 |
| e3-safeguarding | 38/38 |
| leader-info-migrate | 11/11 |
| sg-register-unit | 37/37 (4 new) |
| sg-warnings-unit | 65/65 (1 new) |
| sg-ai-unit | 68/68 |
| rules suite, EGBC | 1966/1966 (15 new: 7 core teams, 8 S4) |
| rules suite, as a church | 1956/1966 (the 10 by design) |
| sg-headroom | at least 20 in both |
| h8-headroom | 80 and 40 |
| check-rules-build | 10/10 |

**For the synthetic parish:**
- **Their own core team** for Junior Church, Messy Church and the youth group sees those groups' session planner and Present. Their worship core team doesn't.
- **Their youth camp** carries actions with a person and a date. The PCC notes it once signed, and that line is on the print.

**Deploy (the reviewing window's):** sgWarningsSync, sgWarningsNow, sgTwoAdultsDaily (the S4 warnings). The rules go live when the hub goes live.

### F-289 — "Still to do": 50 a risk, not 5 (Martin: no limits beyond what a record holds) (the events window, 26 Oct)

**The change:** a risk can now hold **50** things still to do (it was 5).
- The limit is the same in every place: the templates (`T.MAX_TODO`), the server's generated copy, the standing risks' rule (`todo` up to 50), and the register's snapshot.
- **When a risk is full, the page says so:** "A risk holds at most 50 things still to do. Join two together, or take one out, to add another." The register's editor says the same.
- **Why 50, not unlimited:** an event's assessment is one record (at most 1 MB) and already holds up to 200 risks. 50 actions on each fits real use with room to spare.

**Tests:**

| Test | Result |
|---|---|
| sg-assess | 53/53 |
| sg-register | 27/27 |
| sg-register-unit | 38/38: the page, the server's copy and the rules agree on 50, and the page says so when full |
| Rules suite, EGBC | 1966/1966: 50 allowed, a 51st refused |
| Rules suite, as a church | 1956/1966 (the 10 by design) |
| check-rules-build | 10/10 |

**Headroom, measured after:** sg-headroom at least 20 in both rulesets; H-8 at least 80 (a four-part hall at least 40). Both unchanged.

**Breaks** (both caught):

| Break | Result | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** the rules back to 5 | rules 1965/1966 | "a standing risk keeps up to 50" |
| the page says nothing when a risk is full | sg-register-unit 37/38 | "… the page says so when full" |

**Deploy:** none (no function changed). The rules go live when the hub goes live.

### F-290 — Safeguarding step 5: look at a standing risk again after an incident on its activity, or when its group's size changes a lot (F-280 10.5; Martin's answer 19) (the events window, 26 Oct)

**Built:**
- **Linking incidents to an activity.** Incidents are recorded on an event (safeguarding.html), and an event doesn't say which regular group it belongs to.
  - **What the lead sees:** on the register's Standing risks tab, a box, "Incidents to link to an activity", for this year's incidents at the site not yet linked. Each has a list of the register's activities and a Link button.
  - **Only the date and the event's title are shown.** Never what happened or who; that stays on the event's own page.
  - **The rules:** the site's lead (or deputy) may set `activityId` on an incident, and only to an activity on the same site. What was reported still can't change. A leader can't link one.
- **"Review prompted"** (worked out by the daily safeguarding check, functions/sg-warnings.js → `reReview()`):
  - **An incident:** an incident linked to the risk's activity, newer than the risk's last review (when it was last saved; the time counts, not just the day). The risk shows "Review prompted: an incident on <date>".
  - **The size:** the group's size changed by a quarter or more since the last review. The risk shows "Review prompted: the group has gone from 12 to 20 since the last review".
    - The size is a kids group's registered children, or a small group's members.
    - It is kept on the risk when it's reviewed (`sizeAtReview`).
    - The quarter is a setting on Safeguarding settings, 25% unless changed.
  - **Both are amber in the Warnings** (counts only): "1 risk to look at again: an incident on that activity since it was last reviewed", and the size one.
  - **Reviewing the risk (saving it) clears the prompt.** The page asks the server to work the warnings out again straight away.
- **Counts only throughout:** only an incident's date and its activity are used. Its words, its people and its follow-up are never read for this.

**Breaks** (6, each caught):

| Break | Test | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** an incident on the activity never prompts its risks | sg-register 30/32 | "THE JUNIORS RISK SAYS 'Review prompted …'"; "the warnings count it" |
| any change in size prompts it (the setting ignored) | sg-warnings-unit 71/72 | "12 to 16: prompted; 12 to 14: not" |
| the event's leader may link an incident | rules 1990/1993 | "the event's leader can't link it" and two more |
| another site's activity may be linked | rules 1992/1993 | "not to another site's activity" |
| the list of incidents to link shows what happened | sg-register 31/32 | "by date and event only - never what happened or who" |
| a review never clears the prompt | sg-warnings-unit 71/72 | "one before the last review … none" |

**Tests:**

| Test | Result |
|---|---|
| sg-register | 32/32 (5 new) |
| sg-dash | 45/45 |
| e3-safeguarding | 38/38 |
| sg-assess | 53/53 |
| sg-warnings-unit | 72/72 (7 new) |
| rules suite, EGBC | 1993/1993 (7 new) |
| rules suite, as a church | 1983/1993 (the 10 by design) |
| check-rules-build | 10/10 |

**Headroom:** sg-headroom at least 20 in both rulesets; H-8 at least 80 (a four-part hall at least 40). Both unchanged.

**For the synthetic parish:** after an accident at Junior Church, their parish safeguarding officer links it to Junior Church on the register. Junior Church's risks then show "Review prompted" until they are looked at again. So does a youth group that has grown from 12 to 20.

**Deploy (the reviewing window's):** sgWarningsSync, sgWarningsNow (the prompts and sizes). The rules go live when the hub goes live.

### F-291 — Safeguarding step 6: the host's requirements from their web pages or pasted text, read safely (F-280 10.6) — ready for the Newday real call (the events window, 27 Oct)

**Built:**
- **On the assessment's host box,** beside "Their list" (a file):
  - "Or their web pages: up to 5 addresses, one a line"
  - "Or paste their requirements"
  - **One level down:** the pages each address links to on the same site are read too. A help centre's folder page, like Newday's, is enough.
- **A new call, `sgRequirementsFromLinks`** (functions/sg-ai.js). It's the same as a file: the same people, the same daily limits, the same log (kind `requirements-web`, counts only, never an address or the words), and the same reader instructions.
  - **The page words go to Claude,** each with its address; a PDF goes as a document. Socket covers and personal details are left out, as for a file.
  - **Each question says which page it came from** (`source`, or "pasted text").
  - **What was read is kept** in Storage beside the files ("What was read from the web pages.txt").
- **The safe reader** (functions/sg-links-core.cjs, pure, every protection tested with a stand-in and no network):
  - **Https only,** on the standard port, with no name or password in the address.
  - **Public addresses only:** the name is looked up, and if any address it gives is private, it's refused. That covers private, loopback, link-local (169.254.169.254, the cloud's own, among them), shared, multicast, reserved and IPv6 local.
  - **The connection goes to the address that was checked** (`pinnedRequest`, with the right name for the certificate), so the name can't be switched in between.
  - **Redirects are followed one at a time,** each checked the same way, at most 3, never to plain http.
  - **Caps:** 2 MB a page (stopped as it arrives), 20 pages, 45 seconds; web pages, plain text or PDF only.
  - **The links on each page given, to the same site, one level down only.** Never another site, a picture, a style sheet or a script.
  - **Scripts, styles, menus, headers, footers and forms are stripped.** Only the words go.
- **The leader checks before anything counts,** as for a file:
  - the pages read are listed with their addresses
  - anything not read is listed with why
  - each question shows its page
  - nothing is required until confirmed
- **The print's appendix** says "taken from N of <host>'s web pages", lists them, and shows each question's page.
- **On the emulator only,** a test can name its own stand-in web server (`sgAiStub/config.webHosts`). The live server never reads that.

**Tests:**

| Test | Result |
|---|---|
| sg-links-unit (new) | 21/21: https only; the standard port; private addresses, a name that points to one, and a name with one public and one private address; connected to the checked address; a redirect to a private address or to http; more than 3 redirects; over 2 MB; not a page; one level down and the same site only; 20 pages; 45 seconds; scripts and menus stripped |
| sg-host | 40/40 (8 new): a stand-in help centre's folder and its two articles read; only the words sent; each question's page; the pages shown before confirming; what was read kept; a private address (and 169.254.169.254) refused with nothing sent to Claude; pasted text alone; the log |
| sg-assess | 53/53 |
| sg-print | 42/42 |
| sg-ai | 73/73 |
| sg-ai-unit, sg-register-unit, sg-warnings-unit | pass |

**Breaks** (9, each caught):

| Break | Test | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** private addresses read | sg-host 39/40 | "A PRIVATE ADDRESS … nothing goes to Claude" |
| the same | unit 17/21 | the name that points privately; the mixed name; the metadata address |
| plain http read | unit 19/21 | "https only" |
| not connected to the address that was checked | unit 20/21 | "CONNECTED TO THE ADDRESS THAT WAS CHECKED" |
| a redirect not checked | unit 19/21 | "A REDIRECT TO A PRIVATE ADDRESS" |
| links to other sites followed | unit 20/21 | "not another site's page" |
| no page limit | unit 20/21 | "AT MOST 20 PAGES" |
| scripts and menus not stripped | unit 20/21 | "SCRIPTS … stripped" |
| the page hides which pages were read | sg-host 39/40 | "THE LEADER SEES THE PAGES READ" |

- **Note:** the first run of the "other sites" break against sg-host wasn't caught. The test's other-site link was a real, resolvable name, so under that break the reader may have looked that name up. It's now a reserved name that never resolves (`.invalid`), the break is checked against the unit test (no network), and sg-host also checks the other site isn't even tried.

**Ready for the real call:**
- **Deploy (the reviewing window's):**
  - `sgRequirementsFromLinks` (new; it declares `CHQ_ANTHROPIC_API_KEY`, the existing secret; no new secret)
  - `sgExtractRequirements` (it shares the reader's code)
- **Then the reviewing window:**
  1. On the live hub, create "Example: Newday camp (test, not real)": an under-18s camp, with leaders.
  2. On its safeguarding page, in the host box: "Newday (test)", and the five folders, one a line:
     - https://newday.freshdesk.com/support/solutions/folders/80000687928
     - https://newday.freshdesk.com/support/solutions/folders/80000639163
     - https://newday.freshdesk.com/support/solutions/folders/80000639070
     - https://newday.freshdesk.com/support/solutions/folders/80000704765
     - https://newday.freshdesk.com/support/solutions/folders/80000639039
  3. Press "Read the requirements". At most 20 pages are read, so not every article may be; the list says which were, and which weren't.
- **What to look for:**
  - the pages read
  - the questions, each with its page
  - nothing from the menus
  - no socket covers
  - the log (`requirements-web`)
- **The rules:** none changed in this step.

**For the synthetic parish:** their camp's organiser, or the diocese's youth weekend, has only web pages. The parish safeguarding officer gives the addresses, checks the questions the hub reads from them, and confirms.

### F-292 — Reading a help centre's pages: its articles, not its menus (the live Newday run, 27 Oct) (the events window, 27 Oct)

**What the live run found** (the reviewing window, on "Example: Newday camp (test, not real)"):
- 29 good questions, each with its page.
- **But the 20 pages were spent on the site's own pages** (home, solutions, new ticket, the category page, search) before the articles. The General Information articles, with the key site rules, were never reached.
- Three redirect loops (login, search topics, search tickets) went round three times each.

**The fix** (functions/sg-links-core.cjs):
1. **Which links:** only those in the page's own content. Its menus, header, footer and sidebar are set aside before links are chosen, not only when reading the words.
   - Only links that go deeper than the page or beside it, under the same part of the site. A folder at /support/solutions/folders/… gives its articles at /support/solutions/articles/…
   - Never the site's home, search, login, tickets, account or similar pages, and never the category page above it.
2. **The order:** the addresses given first, then their articles in turns: each folder's first, then each one's second, and so on, in the order each page lists them. So each folder gets its share before the cap.
3. **The cap is 40 pages** in the same 45 seconds (it was 20). With 60 articles across 5 folders, each folder gets 7.
4. **A redirect that loops back is skipped at once,** not followed three times.
- **"Read more" was not built:** 40 pages covers Newday's 5 folders. If a host ever has more, the list on the page says which pages weren't read.
- **The host box** now says: "The articles each one lists on the same site are read too (40 pages at most), never the site's menus, search or login pages."

**Tests:**

| Test | Result |
|---|---|
| sg-links-unit | 26/26 (5 new, plus 40 pages, not 20) |
| sg-host | 40/40 |
| sg-assess | 53/53 |

- **The new checks use a stand-in help centre built like Newday's:**
  - home, solutions, new-ticket, login and search links in every page's header
  - a breadcrumb to the category page
  - a footer to the search pages
  - a "Popular article" link in the header
  - login and search going round in redirect loops
  - 5 folders of 6 articles
- **They check:**
  - all 30 articles are read and none of the site's own pages
  - the header's article isn't read
  - the order takes turns across the folders
  - with 60 articles, each folder gets 7 of the 40 pages
  - a redirect loop is skipped after one round

**Breaks** (5, each caught):

| Break | Result | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** any same-site link followed (as before the live run) | 24/26 | "ALL 30 ARTICLES READ"; "NONE OF THE SITE'S OWN PAGES" |
| menus and headers not set aside when choosing links | 25/26 | "… nor an article linked only from the header" |
| not in turns | 24/26 | "IN TURNS ACROSS THE FOLDERS"; "each folder gets its share (7 each)" |
| a redirect loop gone round three times | 25/26 | "A REDIRECT LOOP is skipped at once" |
| the cap back at 20 | 23/26 | three checks |

**Deploy (the reviewing window's):** sgRequirementsFromLinks. Then run it again on the practice camp: the 29 unconfirmed questions are replaced by the new list, which the leader checks.

### F-293 — "Read the next": the rest of a host's pages, 40 at a time (the second live Newday run, 27 Oct) (the events window, 27 Oct)

**What the second live run found** (the reviewing window, on "Example: Newday camp (test, not real)"):
- 40 pages read, all articles and none of the site's own pages: 35 questions.
- But Newday's 5 folders hold about 48 articles, so some were never reached: night team, key dates, arrival and set-up, vehicles on site, generators.

**What was built:**
- **What wasn't reached is kept** with the assessment (`host.web.next`), in the same turn order. The host's own addresses are kept too (`host.web.starts`).
- **"Read the next N"** appears under "Read from … pages" while pages are left. It says how many weren't read yet, and that each read counts as one use of the AI.
  - It carries on from where the last read stopped: the same addresses, the next articles in turn. It never re-reads the folders or an article already read.
  - The limits for each read are the same: 40 pages and 45 seconds. The leader can press it again.
- **It adds to the same list,** still to be checked.
  - The leader's changes on the page are saved first.
  - Claude is told the questions already there and asked not to give them again.
  - Any that still comes back the same is left out (ignoring case, spaces and punctuation) and counted. The page says so: "One question from the next pages repeated ones already here, and was left out."
  - After the read, the page says "N new questions added from M more pages."
- **If the list was already confirmed,** reading more puts it back to be checked. The page says so before the leader presses.
- **It counts against the day's AI limit like any call.** It is logged as "requirements-web-more", never with an address.
- **What was read is kept** in one file: the first read and every later one.
- **Pages not reached in the 45 seconds** are now kept for the next read, not lost. They are named "not reached in the 45 seconds".
- **Only the host's own site:** a link in the kept list that isn't on one of the host's own addresses' sites is never tried.
- **Nothing left:** the button goes, and asking anyway says "There are no more of the host's pages to read." Nothing goes to Claude.
- **The list's 500-question bound (H-9)** still holds. If it fills, the page says the rest were not added.

**Tests:**

| Test | Result |
|---|---|
| sg-links-unit | 34/34 (8 new) |
| sg-host | 51/51 (section 12, new) |
| sg-assess | 53/53 |
| sg-ai-unit | 68/68 |

The stand-in help centre has 5 folders of 12 articles (60):
- The first read is 40 pages, and 25 are kept.
- "Read the next 25" reads folder 1's 8th article first, then the rest, and never a folder or an article already read.
- The AI is told the 2 questions there (with the leader's change).
- The repeat is left out, and the new one is added: 3 on the list, still to be checked.
- 65 pages are listed as read, and the button goes.
- Both reads are in the kept file.
- The day's use goes up by one.
- With 100 articles, the next read is 40 more, and 25 are left for another.

**Breaks** (8, each caught):

| Break | Result | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** the next read starts from the beginning again | 44/51 | "carries on where it stopped" and 6 more |
| repeats added | 49/51 | "no repeats" |
| a repeat not recognised (in the unit test) | 33/34 | — |
| the AI not told the questions already there | 50/51 | — |
| the leader's changes lost | 49/51 | — |
| the list not kept in turn order | 30/34 | — |
| pages not reached in time lost | 33/34 | — |
| a page on another site put in the list is read | 50/51 | — |

**For the synthetic parish:** the same for any host with more pages than one read takes. Nothing is church-specific.

**Deploy (the reviewing window's):** sgRequirementsFromLinks. Then on cev_newdaytest2027: the 35 questions there were read before the next pages were kept, so they have no button. Read the 5 folder addresses once more (a fresh list replaces them), then press "Read the next N" under it.

**Found, not fixed (for main, F-293):** the page audit (`--quick --no-app`, safeguarding.html and safeguarding-risk.html) now gives 13 passed and 5 failed.
- **What fails:** safeguarding.html "opens for" everyone, worship, kids, core and areaAdmin, whose Menu doesn't offer it.
- **This is on purpose.** Anyone can open the page to report a concern. They see "No events for you here", or "This page is for the event's leaders… You can still report a concern", and no event, child or count.
- **This step didn't change who can open it.** safeguarding-risk.html refuses all five roles, as it should.
- **Main's choice:**
  - (a) the audit lists safeguarding.html as open to everyone for reporting a concern; or
  - (b) the Menu offers everyone a "Report a concern" entry.
  I haven't edited the audit or the Menu (they're main's files).

### F-294 — H&S step 1: the shared risk assessment engine, moved out of the safeguarding code with no change (F-280 section 2 and step 1) (the events window, 27 Oct)

**What was built:** the pieces every register will share are now each in one place.
- **They were moved, not rewritten.** The safeguarding files use them under their old names.
- **Nothing in them is safeguarding's or any church's.** The health, safety and fire assessments (steps 2 to 7) will use them with their own data, rules and pages.

| Shared piece | Now in | Moved from |
|---|---|---|
| Ratings (the bands, High/Medium/Low), "answered", the checklist builder, "still to do" counts, the dials | egbc-ra-core.js | egbc-sg-templates.js, egbc-sg-dash.js |
| The A4 print: header, risk table in words, "still to do" table, a dial cell, the red box, signature lines, the page and its footer | egbc-ra-print.js, egbc-ra-print.css | sg-print.html |
| The AI calls' plumbing: the key, the day's caps, the log, set-up problems and "not working", the call with its retries | functions/ra-ai.js | functions/sg-ai.js |
| Personal details refused before a call; never socket covers; the bands on the server | functions/ra-ai-core.cjs | functions/sg-ai-core.cjs |
| The document reader: what a file is, a Word document's words, the 7 MB limit, "no repeats" | functions/doc-reader-core.cjs | functions/sg-requirements-core.cjs |
| The web reader | functions/web-reader-core.cjs | functions/sg-links-core.cjs (that name is kept) |

- **Each register's AI records are its own.** `aiPlumbing()` is given each register's records (the day's use, the log, the "not working" state, the test stand-in). Safeguarding passes its own (`sgAiUse`, `sgAiLog`, `sgAiState`, `sgAiStub`), so the H&S caps will be separate (F-280 answer 9).
- **Not shared, and why:** the rules. Each register's rules stay its own helpers (F-280 section 2), and the H&S ones come in step 3.

**The proof it's unchanged:**
- **The server's copy of the checklist** (functions/sg-checklist.cjs), regenerated from the moved code, is byte for byte the same.
- **Every safeguarding test passes:**

  | Test | Result |
  |---|---|
  | sg-ai | 73/73 |
  | sg-host | 52/52 |
  | sg-assess | 53/53 |
  | sg-print | 42/42 |
  | sg-register | 32/32 |
  | sg-dash | 45/45 |
  | sg-warnings | 34/34 |
  | sg-lead | 14/14 |
  | e3-safeguarding | 38/38 |
  | under18 | 20/20 |
  | sg-ai-unit | 68/68 |
  | sg-register-unit | 38/38 |
  | sg-warnings-unit | 72/72 |
  | sg-links-unit | 34/34 |
  | e3-safeguarding-unit | 17/17 |
  | sg-ai-smoke | 7/7 |

- **No test's checks changed. What did change:**
  - **Three unit tests and the checklist generator** load the templates file on its own, so each now loads the engine's file first (one line each).
  - **sg-warnings.test.mjs: its two seed leaders now have S3's checks** (barred-list level, reference, declaration).
    - It had been failing since S3 (F-286): those checks are missing from its seed, so 3 amber warnings joined the 5 red ones it counts.
    - That was my miss in S3: I didn't rerun it then.
- **sg-headroom wasn't rerun.** No rules changed in this step.

**New test: ra-engine-unit (18/18).** It checks:
- the safeguarding files use the engine's functions, with no copy left in them
- the server's old names are the engine's same functions
- an invented fire checklist builds in the right order (core, kind, included kind, flag, the church's own)
- the dials and the printed risk table work for it
- a register's AI caps and log go only to the records it names
- no church's name, team or host is in the engine's code

**Breaks:** see the table below.

**For the synthetic parish:** nothing changes for them. The engine has no church's names, teams or hosts in it, and the ra-engine test checks that.

**Deploy (the reviewing window's), when convenient:** the safeguarding functions (sgDraftAssessment, sgAiStatus, sgExtractRequirements, sgRequirementsFromLinks, sgRequirementsFile). They now load the shared files, and nothing they do changes.

**Breaks** (8, each caught):

| Break | Result | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** the shared bands changed (High from 16, not 15) | sg-register-unit 37/38 | "5 x 3 = 15 is high": the safeguarding register follows the engine |
| the shared checklist drops the church's own questions | sg-ai-unit 67/68 | — |
| the shared dial draws 13 blocks | sg-dash 44/45 | — |
| the shared print's red box left out | sg-print 41/42 | — |
| the shared socket-cover check lets them through | sg-ai 68/73 | — |
| the shared reader no longer knows a Word document | sg-host 22/27 | — |
| the shared caps never stop anyone | sg-ai 69/73 | — |
| the shared log ignores the register's own records | ra-engine-unit 16/18 | — |

Two of my first breaks went to tests that don't check them: "None given" in the print, and socket covers aimed at the unit test. I moved them to what those tests do check (the red box; sg-ai's section 13), and both were caught.

**Also in this commit (the reviewing window's note, 27 Oct):** where a page is only a way to reach someone (Newday's night team), the host's list now asks "Does your group know how to reach the night team, and when?", never with the number, the email or a name.
- The line is in REQ_SYSTEM.
- sg-host checks it is in what is sent.
- It needs sgRequirementsFromLinks and sgExtractRequirements deployed.

### F-295 — The host's list: the questions first, the pages read folded away and named, never as web addresses (Martin, 27 Oct, on the live Newday list) (the events window, 27 Oct)

**What Martin said:** "There isn't any point to this list if it is directly below anyway. Plus it's really hard to read." The list was 48 lines of full web addresses above the questions.

**What changed** (egbc-sg-assess.js; the page only):
1. **The questions come first,** straight under the heading.
   - What was read follows them on one line: "Read 43 of Newday (test)'s pages." Then **Show the pages**, folded away and closed.
   - The count is the articles listed. The folder pages given aren't listed or counted.
2. **Each page is named by its title, as a link, never its web address.** This applies to "Show the pages" and to each question's "From: … (page)".
   - The site's name, which every title ends with (" : Newday"), is cut off.
   - A page with no title is named from its address: "can-i-bring-a-generator" becomes "Can i bring a generator", and an address of only numbers becomes "Page 108".
3. **The pages not read:**
   - Their line stays where it was: "8 more of the host's pages were not read yet … Show which", folded away and closed. The **Read the next 8** button stays under it.
   - Pages that couldn't be read at all: "2 pages couldn't be read. Show why", folded away too.
4. **The heading no longer says "(What was read from the web pages.txt)".** The file's button now says **Download what was read**. An uploaded file keeps its name.
5. **The record is unchanged.**
   - The kept file of what was read still has every address.
   - The assessment still keeps each page's address, and the print still lists them.

**Tests:** sg-host 61/61 (9 new); sg-assess 53/53. They check:
- the questions are first under the heading: no list, web address or ".txt" above them
- the line, and that "Show the pages" starts closed
- no web address anywhere on the screen
- each question's page by its title, as a link to its address
- the articles listed, not the folder page
- "Download what was read"
- **at phone width (375):** the questions still come first, and nothing is wider than the screen with the pages opened
- the kept file still has the addresses
- **with 60 articles:** "Read 60 of …", and the titles without " : Testcamp"
- the pages not read are closed, and named
- once confirmed, the same count of articles

**Breaks** (8, each caught):

| Break | sg-host |
|---|---|
| **THE ONE THAT MATTERS:** the list of pages above the questions again | 58/60 |
| the pages open, not folded away | 59/60 |
| web addresses as the names | 55/60 |
| the folder pages listed with the articles | 55/60 |
| the site's name left on the end of each title | 59/60 |
| the pages not read shown open | 59/60 |
| the heading names the .txt file again | 59/60 |
| the confirmed line counts the folder pages too | 60/61 |

(The first seven ran before the confirmed check was added, so they ran out of 60.)

**Once confirmed,** the line counts the same: "Requirements taken from 43 of Newday (test)'s web pages". It used to count the folder pages too.

**For the synthetic parish:** the same for any host's site. The site's name is found from the titles, not written in.

**Deploy:** nothing. The page only. It goes live with the pages (safeguarding.html and safeguarding-risk.html stamps bumped).

### F-296 — H&S step 2a: the church's health and safety settings, who looks after each building, and the duties that follow how many the church employs (F-280 section 8; Martin's answers; the jobs mapping, H-9) (the events window, 27 Oct)

Step 2 is in two parts:
- **2a (this):** what is new.
- **2b (next):** moving my existing compliance, risk and maintenance pages and compliance.js off team names onto the jobs; the office looked up by site (no 3-site cap); my old caps.

**What was built:**
- **hs-settings.html, "Health and safety settings":** for master admins and the team that does the **office job**. This is read through main's jobs mapping (EGBCTeamJobs.onJob), never a team's name.
  - Anyone else is told who sets them, by that team's own name: "These are set by the Parish office and master admins".
  - The page opens with the "not legal advice" words, as Martin approved them (answer 12).
  - It is linked from Building compliance for its admins. **The Menu entry is main's:** see "For main" below.
- **Who looks after health and safety, for each building** (`raSiteRoles/{siteId}`):
  - the health and safety lead, the deputy (two different people) and the fire safety lead (who may be the lead)
  - member ids only, with names from the address book, so a name never sits beside someone else's id (F-287's lesson)
  - each building shows "The responsible person on its fire assessment: The trustees of <church>, with <fire lead>, the fire safety lead, acting for them" (answer 3).
- **How many the church employs** (`raSettings/church`; Martin's answer to question 11):
  - the number, "someone works at a screen as a regular part of their job", and when a staff team is "larger" (10 by default, a setting)
  - the duties it brings are listed as it is typed (egbc-hs-core.js `DUTIES`):

  | Employed | What applies |
  |---|---|
  | 1 or more | employers' liability with its certificate where employees can see it; the "Health and safety law" poster or leaflet; knowing which injuries to an employee must be reported, and to whom; a first-aid needs assessment that covers employees |
  | 5 or more | a written health and safety policy; the significant findings written down |
  | Screen work | a workstation (display screen) assessment for each person |
  | A larger team | staff training recorded; employees consulted; lone working arrangements for staff |

- **Each duty is a building check** (the compliance templates, **version 4**, 9 new checks):
  - The checks go on each building where someone employed works. That is the building's own question, reworded "Does anyone the church employs work here?", with a note pointing to these settings.
  - When the number changes, every building's checks follow it at once. One that no longer applies is marked "removed", with its history kept, as a changed answer does today.
  - **The number only adds** (five or more, a larger team, screen work). It never overrides a building's answer.
  - **What EGBC will see:** with nothing set, the number adds nothing. But a building that already answers "someone employed works here" will get the three one-or-more checks (the poster, reportable injuries, the first-aid needs assessment) once version 4 is seeded. They apply to any employer, so I think that's right; say if you'd rather they waited for the number.
- **The merge is in the compliance store** (egbc-compliance-store.js and its server twin, still identical). So the pages and the monthly server summary see the same checks, and the added flags are never stored.
- **Insurance cover:**
  - public liability, flagged under the church's minimum (£1 million by default, a setting; F-281 (d))
  - employers' liability (shown when anyone is employed), flagged under the £5 million legal minimum
  - the certificates stay with the insurance checks
- **The numbers the later steps use:**
  - action target dates by priority (High 1 month, Medium 3, Low 6; answer 8)
  - an event needs an assessment from 100 people (answer 4)
  - the H&S AI caps: 20 a day for the church and 5 for a person, 0 to 500, separate from safeguarding's (answer 9)
- **Rules** (EVENTS section): `raSettings/church` and `raSiteRoles/{siteId}`.
  - **Who:** master admins, or the office job, through `raJobTeams()`/`raOnJob()`. These read churchSettings/teamJobs, with EGBC's team as the default, the same answer as EGBCTeamJobs.teamsFor. [] is nobody.
  - **What:** whole numbers, with no cap but what a record holds (H-9); AI 0–500; months 1–120; only the known fields; a real building; lead and deputy two people; never deleted.
  - Anyone signed in may read them (counts and amounts, no names).
  - Rebuilt; check-rules-build passes.

**The sources** (in F-232's table layout, so compliance-stage1 finds them; never shown on the page; employers' liability: the Employers' Liability (Compulsory Insurance) Act 1969, at least £5 million, the certificate where employees can see it or online where they can reach it):

| Check (id) | Frequency | Label | Source | Checked |
|---|---|---|---|---|
| hs-law-poster: the law poster or leaflet | Once (and when it changes) | Legal requirement | Health and Safety Information for Employees Regulations 1989: display the approved poster or give each employee the leaflet | 27 Oct 2026 |
| reportable-injuries: know what to report | 1 year | Good practice | RIDDOR 2013 (the duty to report; the yearly look is ours). The accident book says when an injury is reportable | 27 Oct 2026 |
| first-aid-needs: first-aid needs assessment | 1 year (and when the work or staff change) | Good practice | Health and Safety (First-Aid) Regulations 1981 and the HSE's L74: an assessment of first-aid needs (no interval; yearly is ours) | 27 Oct 2026 |
| hs-policy-written: the written policy | Once (its review is hs-policy) | Legal requirement | Health and Safety at Work etc. Act 1974 s.2(3): written with five or more employees | 27 Oct 2026 |
| hs-findings-written: significant findings written | Once (with each assessment) | Legal requirement | Management of Health and Safety at Work Regulations 1999 reg. 3(6): record the significant findings with five or more employees | 27 Oct 2026 |
| dse-assessment: workstation assessment | 1 year (and for anyone new, or a changed workstation) | Good practice | Health and Safety (Display Screen Equipment) Regulations 1992 reg. 2: assess each user's workstation; review when it changes (yearly is ours) | 27 Oct 2026 |
| staff-hs-training: staff training recorded | 1 year | Good practice | Health and Safety at Work etc. Act 1974 s.2(2)(c) and the 1999 Regulations reg. 13: training (no interval). Martin's table: for larger staff teams | 27 Oct 2026 |
| consult-employees: employees consulted | 1 year | Good practice | Health and Safety (Consultation with Employees) Regulations 1996 (no interval). Martin's table: for larger staff teams | 27 Oct 2026 |
| staff-lone-working: lone working for staff | 1 year | Good practice | HSE INDG73 "Protecting lone workers" (no interval). Martin's table: for larger staff teams | 27 Oct 2026 |

**Tests: hs-settings.test.mjs 29/29.** It checks:
- **Who may use it:**
  - someone without the office job is refused, by the page and the rules
  - a trustee without the office job is refused by the rules
  - the office job (EGBC's default) may
- **The number and the duties:**
  - before a number, only the building's own one-or-more checks
  - 6 employed with screen work: the duties listed as typed, and saving adds them only at the building where someone employed works
  - 12 employed: the larger-team checks
  - back to 3 with no screens: the 5-or-more, screen and larger-team checks marked removed, the one-or-more ones kept
  - the store adds the flags and never stores them
- **Who looks after each building:**
  - lead and deputy the same person: refused by the page and by the rules
  - the responsible person names the fire safety lead
  - saved as ids only
- **Insurance:** both cover flags show, and go when there's enough cover.
- **The rules:** 8 bad writes refused; 500 AI drafts and 2,000 employees allowed (no hidden cap).
- **The synthetic parish:**
  - with its "Parish office" doing the office job, a "Church office" team is refused (page and rules) and the Parish office may
  - a job nobody does lets nobody but master admins in
- **One set of sums:** egbc-hs-core.js and both copies of the store agree in 48 cases.
- **Phone width (375):** nothing wider than the screen.

**For main** (your files; I haven't touched them):
1. **The Menu (egbc-menu.js):** an entry for **Health and safety settings** (hs-settings.html), for master admins and the office job. Please put it beside Building compliance.
2. **app.html:** egbc-compliance-store.js and egbc-compliance-templates.js are now `?v=202610271900`. app.html still has the old stamps. With the old store, only "the checks given to me" is affected, and it already works from saved checks, but please bump them.
3. **The audit (tests/audit-everything.mjs):** please add **sg-print.html** (the reviewing window asked) and **hs-settings.html** to its page list, so their access is checked.
4. **GOING-LIVE.md:** "Seed the building checks' templates: `node tools/seed-compliance.mjs --templates --live --write` (events window, SWITCHOVER-events.md 3.10)."
5. **A shared rules helper for jobs:** `raJobTeams(job, egbcTeams)` / `raOnJob(job, egbcTeams)` are in my EVENTS section for now. When H-9 part 2 adds one for everyone, I'll move to it.

**For the synthetic parish:**
- It maps its Parish office to the office job, and it may set these.
- It names its own leads at each of its three buildings, and its PCC are "the trustees" on the fire assessment's responsible-person line.
- With about 30 employed (F-281), every duty above applies where staff work, including the larger-team ones.
- Nothing in this step names EGBC: "Church office" appears only as the jobs mapping's default.

**Deploy:** nothing to deploy (no functions).
- The rules go live when the hub goes live.
- **Version 4 of the templates** reaches the live database through `tools/seed-compliance.mjs --templates --live --write`.
  - It was on no going-live list. I've added it to SWITCHOVER-events.md 3.10, with setting up Health and safety settings.
  - **For main:** please add the same line to GOING-LIVE.md (item 4 below).

**Breaks** (8, each caught by hs-settings):

| Break | Result | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** the rules ask for a team called "Church office", not the office job | 27/29 | the synthetic parish's two checks |
| the page asks for the team's name, not the job | 28/30 | the same |
| the store saves the number's flags onto the building | 27/30 | "never stored on the building" and 2 more |
| the buildings' checks don't follow a new number | 26/30 | "the buildings' checks follow it" and 3 more |
| the rules let the lead and deputy be one person | 28/29 | "the rules refuse the lead and deputy the same" |
| the rules let AI drafts go past 500 | 28/29 | "5. THE RULES" |
| the server's store works out "five or more" differently | 29/30 | "THE SAME SUMS" |
| screen work counted without the tick | 29/30 | "THE SAME SUMS" |

- **A mistake in my break runs, fixed:** the emulator reads the built rules file, so in the first run a rules break's build stayed in place for the breaks after it.
  - So I reran the five that weren't rules breaks, each with its own rebuild, and those results are above.
  - One of my first breaks couldn't be caught, because the new checks already need the building's own answer. I replaced it with "saves the flags onto the building", and added a test check for it.
- The rules are rebuilt as they are, and check-rules-build passes 10/10.

**Nothing else changed:**

| Test | Result |
|---|---|
| compliance-stage1 | 57/57 (its source-row check found the new checks' rows above) |
| compliance-stage2 | 44/44 |
| compliance-stage3 | 31/31 |
| compliance-stage4 | 41/41 |
| compliance-gate | 17/17 |
| the rules | 1999/1999 |
| AS_CHURCH | 1989/1999 (the known 10) |

## From the main window, 26 Oct 2026: Book a room is for team leaders and core teams (Martin's decision, H-16)

**Martin decided:** "Book a room: core teams and team leaders only (not every member)." Hire our rooms and Maintenance stay for every member.

**Done on my side (committed and pushed, 26 Oct):**
- **`EGBCAuth.leadsOrCore()`:** true for any of these:
  - a master admin;
  - anybody who administers a team;
  - a leader by role on one;
  - anybody on a core team.
  - View as answers for the person being viewed.
- **The guard has a new tag, `data-leads`,** which refuses everybody else ("For team leaders and core teams").
- **The Menu's Book a room** and the app's **What's on > Book a room** row now ask the same thing.

**Asked of you (rooms.html and its rules are yours):**
1. **Put `data-leads` on rooms.html's guard:** `<script src="egbc-guard.js?v=…" data-leads></script>`. Until then, the page opens for any member who has the address.
2. **The rules:** whoever may make a member's booking (not a hirer's request) should be the same people:
   - a master admin;
   - `adminFor` not empty;
   - a `roles` value of leader or above;
   - or a core team (`covers` not empty is the server's own answer for that).
3. **A question for you to put to Martin, if you think it matters:** the Church office and the bookings admins open rooms.html from the app's Bookings tab, to see the day.
   - As decided, they are refused unless they also lead a team or are on a core team.
   - If they should keep it, `data-also-team="Church office"` covers the office.
   - The bookings admins would need a line in the guard.

**Check:** the access matrix (`node tools/access-matrix.mjs`, ACCESS-MATRIX.md) lists Book a room under "Where the code differs from Martin's decisions" until both are in.


## From the main window, 27 Oct 2026: F-296 and F-293, main's parts done (b9163c0f)

- **F-296:**
  - items 1, 3 and 4 are done. Health and safety settings is on the Menu for the office job, the stamps are updated, and step 18 of GOING-LIVE.md names the templates' live seed;
  - item 5 (a shared rules helper for jobs) waits for H-9 part 2.
- **F-293, option (a):** the audit treats safeguarding.html as open to anyone by design (report a concern). sg-print.html is now audited.
- **Asked of you:** `giftAidOffice()` in the rules names the team "Finance". The Menu and Payments follow the money team setting (`paymentSettings/public.moneyTeam`), so a church whose money team is called "Treasury" gets the Menu entry but is refused by the rules. Could it follow the same setting, or the jobs (H-9)?
### F-297 — H&S step 2b: my compliance, risk, maintenance, caterers' and payments pages follow the jobs, not team names; the accounts setting for any number of sites; Book a room for team leaders; my old caps up to 500 (F-280 section 8; H-9; H-16) (the events window, 27 Oct)

**What was built:**
- **The jobs, not team names (H-9).** Each of these now asks main's jobs mapping (`EGBCTeamJobs.teamsFor`, with the setting and then EGBC's team as fallbacks), on the page, in the rules and in the functions:

  | Where | Job | Was |
  |---|---|---|
  | Building compliance, the risk register (pages and rules) | office, trustees | "Church office", the Elders |
  | Maintenance (page, the app's Maintenance, rules) | buildings | "Maintenance" |
  | The caterers' list (page and rules) | catering | "Catering" |
  | Payments, Gift Aid (page, rules, `isTreasurer`) | finance | the money team setting, or "Finance" |
  | The safeguarding register's trustees (page, rules, `maySee`) | trustees | the trustee team setting |
  | The monthly compliance summary (functions/compliance.js) | office, trustees | "Church office", the Elders |

  - Covered teams count everywhere, as the rules' `myTeams()` does.
  - A page that refuses someone names the church's own teams: "This page is for the office (Parish office), the trustees (PCC) and master admins." The maintenance photo words say "Only the Fabric team and the office see the photo".
  - Payments says when team jobs decide the money team: "Church settings' team jobs say who does the finance job, so it is changed there." The team picker hides then.
  - **Main's question on `giftAidOffice()` is answered by this:** it is now the office job or the finance job. The finance job falls back to the money team setting, then "Finance". The rules read `paymentSettings/team`, which the setting's function writes together with `paymentSettings/public.moneyTeam`, so they agree.
- **The accounts setting for any number of sites (F-108's cap of 3 gone).**
  - Each site's bookings admins now read their own site's copy, `accountsFor/{siteId}`. The church-wide `settings/accounts` is for admins only.
  - An admin's save writes every site's copy, in batches.
  - A site added since then gets its copy when an admin next opens Room bookings (`fillMissing`).
  - Rules: read by that site's office; written by admins; only the setting's own fields.
- **Book a room for team leaders and core teams (main's H-16 ask):**
  - rooms.html carries `data-leads`.
  - A member's booking or request needs `leadsOrCore()` in the rules: a master admin, anyone who administers a team, a leader by role, or a core team (covers).
- **My old caps up to 500 (H-9), and the page says when a list is full:**
  - the welcomers (was 30)
  - Kids Church and groups settings' teams (were 20)
  - a group's visibility teams (was 10)
  - the fire roll call's people (was 60)

  Still to do: a job's responsible people (10) and files (10) in step 3; an event's teams (30) and audiences (30) in step 5.
- **Health and safety settings:** covered teams now count for the office job, as in the rules.

**Tests:**
- **jobs-2b.test.mjs (new), 28/28.** As the synthetic parish (Parish office, PCC, Fabric team, Kitchen team, Treasury):
  - each page lets in the team doing the job and turns away a team named as EGBC's
  - the words name the parish's own teams
  - a plain member is refused Book a room, and a team leader opens it
  - the accounts setting is copied to all four sites; the fourth site's bookings admin reads it, but not the church-wide setting; a missing copy is filled
  - then EGBC with no team jobs stored works as before
- **The rules, 2040/2040; as a church, 2030/2040 (the known 10).** The new "BY JOB" block covers:
  - buildings, the safeguarding register, repairs (with a covering core team), the caterers' list, payment settings and Gift Aid
  - a job nobody does lets nobody in
  - the accounts copies for a fourth site
  - Book a room refused to a plain member, allowed to a covering team
  - the new caps: 500 allowed and 501 refused
- check-rules-build 10/10. check-stamps 11/11.

**Breaks** (12; each caught; the rules rebuilt after each and at the end):

| Break | Result | Caught by |
|---|---|---|
| **THE ONE THAT MATTERS:** compliance's rules ask for a team called "Church office", not the office job | rules 2035/2040; jobs-2b 28/28 | "the Parish office does the office job: it keeps the building compliance" and 4 more |
| maintenance's rules ask for "Maintenance" | 2037/2040 | "its Fabric team marks a repair done" and 2 more |
| the caterers' rules ask for "Catering" | 2038/2040 | "its Kitchen team reads the caterers' list" and 1 more |
| the register's trustees by the setting, not the job | 2037/2040 | "the PCC reads the safeguarding register" and 2 more |
| Book a room's rules let any member book | 2037/2040 | "a plain member is refused" and 2 more |
| the welcome list's cap back to 30 | 2039/2040 | "500 people see the newcomers' hellos" |
| the compliance page asks for "Church office" | 26/28 | "the Parish office opens it" and 1 more |
| the maintenance page asks for "Maintenance" | 10/13 | "the Fabric team may mark a repair done" and 2 more |
| the caterers' page asks for "Catering" | 26/28 | "the Kitchen team sees the orders" and 1 more |
| the payments page asks for "Finance" | 26/28 | "Treasury opens it" and 1 more |
| Book a room's page lets any member in | 27/28 | "a plain member is turned away" |
| an admin's save writes no site copies | 25/28 | "copies it to every site" and 2 more |

- The first break passes jobs-2b, because the compliance page decides by the job itself. Only the rules suite catches a rules-only break, so it is the one to run.

**Nothing else changed** (the earlier tests, run again):

| Test | Result |
|---|---|
| hs-settings | 30/30 |
| compliance stage 1, gate, stage 2, stage 3, stage 4 | 57/57, 17/17, 44/44, 31/31, 41/41 |
| sg-register, sg-dash, sg-warnings, sg-lead | 32/32, 45/45, 34/34, 14/14 |
| maint-jobs, close-room, roomday | 13/13, 29/29, 34/34 |
| stripe, payments-shut, gocardless, payments-nowebhook | 34/34, 11/11, 42/42, 17/17 |
| r2-bookings, r3-bookings, combined-rooms, room-card | 50/50, 42/42, 33/33, 55/55 |
| c5-stage2, c5-stage3, c5-hire-quote | 32/32, 48/48, 16/16 |
| newhere, fire-rollcall, e3-settings | 27/27, 24/24, 21/21 |
| c7-groups, c7-stage2, who-can-come, phone-fixes, app-jobs-office | 35/35, 26/26, 15/15, 24/24, 24/24 |

**Tests I changed, and why:**
- **The five room tests:** their booking member is now a team leader (Book a room, H-16).
- **compliance stages 2 and 3:** the new words naming the teams.
- **c5-stage3:** writes the site's copy, as an admin's save does.
- **payments-shut:** "when the hub goes live". Main changed the functions' words (69228669), and this test was left behind.
- **c7-stage2:** a groups admin is not the safeguarding lead, so since the 22 Oct rule she sees "the safeguarding lead can see this", not the DBS dates. A master admin's view is checked instead.
- **gocardless:** waits for "Changed: £25.00", which the page writes after it reloads.
- **sg-register:** its header now names the functions emulator, which F-290's step 8 needs.

**For main** (your files; I haven't touched them):
1. **app.html:** egbc-app-maint.js changed (the buildings job, and the words). Please bump its stamp from 202610101200.
2. **egbc-app.js SPACES:** the Maintenance space's `teams: ['Maintenance']` could follow the buildings job. app.html's cards that name 'Church office' could follow the office job.
3. **egbc-menu.js:**
   - `node.money` checks `who.moneyTeam` only. A church that gives the finance job to "Treasury" in team jobs is let in by the rules and the pages, but the Menu doesn't offer Payments. Could it ask `EGBCTeamJobs.teamsFor(jobs, 'finance', set)`?
   - The same goes for `isSgTrustee` and the trustees job.
4. **The access matrix:** I couldn't run check-access-matrix. It uses the dev ports (8181, 9099), and another window's dev emulators held them; I didn't stop them. Please run it when you can. Book a room should now leave the "differs from Martin's decisions" list.

**For Comms:** `meetingRunner` and the giving write in my rules section still name teams. Could they follow the office and trustees jobs (`raOnJob('office', …)`, `onTrustees()`)? They're yours, so I've left them.

**A question for Martin (main's H-16 point 3):** should the Church office and the bookings admins keep Book a room from the app's Bookings tab, to see the day? Now they are refused unless they also lead a team or are on a core team. If they should keep it, I'll add them.

**Found and not fixed:**
- **Safeguarding settings' trustee box** doesn't say when team jobs decide the trustees, as Payments now does. I'll do it in step 3.
- **A site added after the accounts setting is saved** gets its copy only when an admin next opens Room bookings. Until then, that site's bookings admins see the default setting (no accounts link, pay within 14 days).

**For the synthetic parish:**
- Its Parish office runs compliance and the risk register.
- Its PCC are the trustees: they sign off, and see the safeguarding register.
- Its Fabric team does the repairs, its Kitchen team sees the caterers' list, and Treasury runs payments and Gift Aid.
- Each page names those teams.
- All three buildings' bookings admins read the accounts setting, with no limit of three.
- Its choir leader can book a room; a choir member asks the leader.

**Deploy:**
- **Functions changed:** compliance.js, sg-warnings.js and payments.js. The reviewing window deploys these.
- The rules go live when the hub goes live.
- SWITCHOVER-events.md 3.8 has a line on the accounts copies: after going live, a master admin opens Room bookings once.

**Step 5's plan: away events for any age (the reviewing window's ask, for Martin, 27 Oct):**
- **Three new kinds of assessment:** a day trip, a weekend away or retreat (residential), and adventurous activities.
  - An event needs one automatically when it is off-site or overnight, at any age. This is added to answer 4's triggers, beside "100 people".
- **It refers to the venue, not our building.**
  - The venue's own fire and health and safety arrangements, and its risk assessment, are read with the same document and web readers as a host's requirements (F-292, F-293).
  - Then the camp and overnight questions that aren't about children: sleeping, fire at the venue, travel and drivers, first aid, food and allergens, medical needs, emergency contacts, a named leader on call, weather, adventurous activities.
- **Adults who may be vulnerable:** one question, "Is anyone coming who may need care or support?"
  - If yes, it asks the general-words questions only, with no names and no medical details.
  - Only then does it ask the safeguarding lead or deputy, under the register's existing access. Nothing else from safeguarding shows.
- **Under-18s coming too:** the safeguarding assessment still applies on top, as now. The two are linked, both ways, and never merged.
- **The same as the rest:** the AI draft, the dials, the checklist, the print and the rider.
- **For the synthetic parish:** a PCC away day (a day trip, adults only), a parish pilgrimage abroad (residential and travel, perhaps someone needing support) and a choir trip (a day trip with under-18s, so linked to a safeguarding assessment).


### F-298 — H&S step 3, first part (committed; the step's report comes when step 3 is whole): Book a room for the office and the bookings admins; a new building's Accounts copy at once; the fire roll call for each building; the compliance caps up to 500; the trustee box (the events window, 28 Oct)

**Built:**
- **Book a room:** the office (by job) and each building's bookings admins may book (Martin, 28 Oct). rooms.html decides it itself (the guard can't ask about bookings admins), so `data-leads` is off its guard. The rules' `mayBookRoom()` agrees; it is kept lean, because a fuller version ran past the rules' limit on work in one request.
- **A new building's Accounts copy at once:** new function `accountsForNewSite` (+ `...Church`), functions/accounts-copy.js. Never overwrites; Room bookings' repair stays as a backstop.
- **The fire roll call, one list per building** (`fireRollCall/<siteId>`, and `/all`), 500 each, set in Health and safety settings by master admins and the office job; Safeguarding settings points there. checkin.html and peeps.js read the new lists (peeps.js falls back to the old one until it's moved). The move: `tools/migrate-fire-rollcall.mjs`, on SWITCHOVER Part 1.
- **Caps to 500:** responsible people, files, items; compliance history shows all, 200 at a time.
- **Trustee box** says when team jobs decide. **complianceDaily** is on SWITCHOVER Part 1.
- Also: functions/public-mail-pages.cjs regenerated (F-288 had left it stale).

**Checked:** hs-3a 44/44 (the new function and peeps.js run on the emulator); rules 2074/2074.

**For main:**
1. Menu and app: Book a room for the office job and any bookings admin too. (A guard attribute for that would let me put the guard back.)
2. app.html: egbc-compliance-store.js to `?v=202610281000`.
3. H-9 part 2: jobs on the users record (like `covers`) would let a 4-part room be booked by the office in a church's own hub; it's at the rules' read limit there now.

**Deploy:** `accountsForNewSite`, `accountsForNewSiteChurch` (new); the peepToday* functions in peeps.js (changed, safe before going live). No new secret. complianceDaily stays held. Rules with the hub.

## From the main window, 27 Oct 2026: F-297, main's parts done

- **Book a room, also the office and the bookings admins** (Martin, 27 Oct 2026; your question answered).
  - The new `EGBCAuth.mayBookRoom()` is `leadsOrCore()`, or on a team doing the office job (team jobs; EGBC: Church office), or a site's bookings admin (`bookingSettings/*.bookingsAdmins`, never previewed into).
  - The Menu, the app's What's on and **rooms.html's `data-leads` guard** all ask it now, so your page already lets them in. The guard loads the team jobs first when the answer turns on them.
  - **Yours: the rules.** `leadsOrCore()` in firestore.rules should also allow the office job (`raOnJob('office', …)` or as your compliance block does) and a site's bookings admin, for a booking or a request.
  - The access matrix's decision says the same; the office and the bookings admin persona are offered it.
- **app.html:** egbc-app-maint.js is on 202610281000. The app now loads the team jobs (`loadPerms`) with Home.
- **The Menu by jobs:**
  - Payments is `job: 'finance'`: the finance job, then the money team setting, then "Finance", as yours.
  - `isSgTrustee()` is the trustees job once the team jobs are read, and the setting's team until then.
  - `myJobs()` now counts the teams a core team covers, as the rules' `myTeams()` does.
- **check-access-matrix against 7e0073bc: 14/14.** Book a room has left the "differs" list. Breaks: `office` (Book a room without the office job) and `rooms` both fail.
- **New, check-menu-jobs.mjs (10/10), as St Aidan's:** team jobs give finance to Treasury, the trustees to the PCC and the office to the Parish office. Treasury is offered Payments and a team called "Finance" isn't; the PCC is offered Safeguarding risks and the Elders aren't; the Parish office and a bookings admin are offered Book a room and its page lets them in; a plain member is neither. Breaks `money`, `trustee` and `office` each fail.
- **The app's Maintenance space** is the buildings job now (a parish's Fabric team gets it; a team called "Maintenance" doesn't there). **Not done:** app.html's "Church office" cards (Send an email, Post a notice) follow the Menu's who-may-message rule and the server's sending checks, which also name the team; they move together.
- **Deploy:** nothing of main's. The rules go live when the hub goes live.

## From the main window, 28 Oct 2026: F-298's three asks done

1. **`data-book-room`** on egbc-guard.js: Book a room's people (`EGBCAuth.mayBookRoom()`: leaders, core teams, the office job, any site's bookings admin; egbc-auth.js already reads the bookings admins before the guard decides). You can put the guard back on rooms.html. The Menu and the app's What's on ask the same.
2. **app.html:** egbc-compliance-store.js is on 202610281000 (egbc-events-kids.js was already on 202610251400).
3. **Jobs on the users record:** `users/{uid}.jobs`, kept by the server (functions/core-teams.js, next to `covers`): the jobs the person's teams and covered teams do. It's worked out again when their teams change, and for everyone when churchSettings/teamJobs, `paymentSettings/public.moneyTeam`, `safeguardingSettings/defaults.trusteeTeam` or `prayerSettings/main.prayerTeam` change. No page may write it (the users create rule). A rule can now ask `'office' in me().get('jobs', [])` with no extra read.
   - Checked on the emulator: a Treasury member gets `finance`, and loses it when the job moves to another team.
   - **Deploy (the reviewer's):** `jobsOnTeamJobs`, `jobsOnMoneyTeam`, `jobsOnTrusteeTeam`, `jobsOnPrayerTeam` (each with its `…Church` twin), and `coversOnUser`/`coversOnTeam` again (they now write `jobs` too). After the deploy, writing churchSettings/teamJobs once (or any team change) fills everyone's `jobs`.

### F-299 — H&S step 3 (whole): the building's own health and safety, and fire, risk assessments; a parish church's tower, bells, churchyard, listed building and candles (F-280 section 3 A and B; Martin's answers 1, 2, 7, 8) (the events window, 28 Oct)

**Built (with F-298, step 3 is done):**
- **assessment.html:** each building's two assessments, beside the live risk register (answer 1).
  - **Health and safety:** the HSE's five steps.
  - **Fire:** PAS 79-1's eight headings. It shows the rooms' fire maximums, the responsible person, the visitors' plan (GEEP), and the building's fire checks with their colours. Personal plans are never named.
  - **Hazards:** each rated before and after its controls, by the hub's own sums. Its controls are the building's checks plus written ones. "Add the starter hazards" adds those that fit the building's answers.
  - **Actions:** each has a priority (Immediate, High, Medium or Low). Its date comes from Health and safety settings. One button makes it a safety maintenance job (answer 7).
  - **Required questions:** each must be answered, or "N/A: reason". They follow the building's answers (a kitchen, gas, the tower, candles, and so on).
- **Sign-off (answer 2):**
  - **Who signs:** the building's lead, once every question is answered. For health and safety, that's the lead or deputy. For fire, the fire safety lead or the health and safety lead.
  - **Then:** a trustee, not the signer, countersigns. That version is kept, never changed (`raSigned`).
  - **Changes:** changing a signed assessment starts the next version.
  - **The review check:** countersigning records the building's review check (fire-ra or hs-ra), and the live register records it if a trustee couldn't.
- **The live risk register:** both assessments are on its first tab. Their significant findings (Medium or High after the controls) are listed there, coloured by the checks that watch them.
- **Who:**
  - The office (job), the trustees (job), master admins and each building's leads open it.
  - The leads see only their own buildings. They may now read their own building's compliance records, which the assessment needs.
- **A parish church (templates version 5):** five new questions: a tower, bells, a churchyard, a listed building and candles. Each brings a check and a starter hazard.
- **Rules:** `raAssessments` and `raSigned` (EVENTS section). Rebuilt.

**Checked:** one quick run as the parish. The office drafts, adds the starters and an action, and makes the action a job. The lead signs; the office can't. The PCC countersigns, and the version is kept. The register lists it, and the fire assessment's questions follow the building. Everything worked.

**The new checks' sources** (never shown on the page):

| Check (id) | Frequency | Label | Source | Checked |
|---|---|---|---|---|
| tower-access: tower and roof access safe | 1 year | Good practice | Work at Height Regulations 2005 (plan and make safe any work at height; no interval, yearly is ours) | 28 Oct 2026 |
| bells-inspect: bells, frame and fittings | 1 year | Good practice | Central Council of Church Bell Ringers' guidance on bell maintenance (a yearly inspection; no law sets one) | 28 Oct 2026 |
| memorials: churchyard memorials looked at | 1 year | Good practice | Church Buildings Council and local-authority memorial safety guidance (regular inspection; no interval in law, yearly look is ours) | 28 Oct 2026 |
| listed-consent: consent before building work | Before building work | Legal requirement | Planning (Listed Buildings and Conservation Areas) Act 1990 s.7 (listed building consent), or the faculty jurisdiction under the ecclesiastical exemption | 28 Oct 2026 |
| candles: candles and naked flames | 1 year | Good practice | Regulatory Reform (Fire Safety) Order 2005 art. 9 (the fire risk assessment covers ignition sources; no interval, yearly is ours) | 28 Oct 2026 |

**For main:**
1. **The Menu:** an entry for **Building risk assessments** (assessment.html) for the office job, the trustees job and each building's leads (raSiteRoles: hsLead, hsDeputy, fireLead). Today they reach it from the live risk register, but the leads can't open that.
2. **app.html:** egbc-compliance-templates.js and egbc-compliance-store.js to `?v=202610281000`.
3. **The audit's page list:** add assessment.html.

**Found and not fixed:**
- **The fire assessment can't count people's own evacuation plans:** only master admins read them. A count kept by peeps.js would do; it fits step 6, the dials.
- **The print and the dials are step 6. Reading a professional's report into an assessment is step 4.**

**For the synthetic parish:**
- Its parish church answers yes to the tower, bells, churchyard, listed building and candles, so it gets those checks, starters and questions.
- The Fabric team's lead (named in Health and safety settings) signs, and the PCC countersigns.

**Deploy:** no functions. The rules go live when the hub goes live. The templates' version 5 reaches the live database through the seed on SWITCHOVER-events.md 3.10, which now says version 5.

**F-298 follow-up, with main's F-298 answers (28 Oct):** rooms.html has the guard's `data-book-room` again (the page still shows a bookings admin only their buildings). The rules' Book a room now reads the office job from `users.jobs` (no read), with the team jobs only for a record the server hasn't reached. That lifts the 4-part-room limit in a church's own hub for the office. Main's items 1 to 3 in F-298 are done; F-299's "For main" item 2 (the store) is done too.

## From the main window, 28 Oct 2026: F-299's asks done

- **The Menu: Building risk assessments** (assessment.html), under the building entries: the office and trustees jobs, each building's leads (`raSiteRoles` hsLead, hsDeputy, fireLead; `EGBCAuth.isBuildingLead()`, read at sign-in like the bookings admins), and master admins. The app's building space lists it too.
- **While there:** Building compliance and Live risk register are now the office and trustees jobs, and The building the buildings and office jobs, as your pages decide since F-297 (they named "Church office", "Elders" and "Maintenance").
- **app.html:** egbc-compliance-templates.js is on 202610281000.
- **The audit's page list** has assessment.html (ALSO_AUDIT), for the final test.
- assessment.html's script stamps are on the current egbc-auth, egbc-shell and egbc-guard (202610281400).
### F-300 — H&S step 4: a professional's fire or health and safety report read into the building's own assessment (F-280 section 4; Martin's answers 7 and 9) (the events window, 28 Oct)

**Built:**
- **"Read a professional's report"** on assessment.html, for a draft. It reads a PDF, a Word document, or a photo of each page.
- **A new function, `raReadReport`, reads it with Claude** (functions/ra-report.js, ra-report-core.cjs):
  - **It uses the same reader and plumbing as the safeguarding side,** with its own caps (Health and safety settings: 20 a day, 5 a person) and its own log (`raAiUse`, `raAiLog`, `raAiState`).
  - **What it pulls out:** the assessor, the date, the next review and the overall rating; each finding, with likelihood × severity where the report gives them, or the assessor's own words where not; each action, with its priority and deadline; and the headings a proper assessment has that the report lacks (the gaps).
  - **What it leaves out:** names, phone numbers and emails, and socket covers.
  - **The original file is kept** where the live register keeps reports.
- **Nothing joins the assessment until a person checks each line.**
  - A finding with only words needs its numbers set first.
  - An "immediate" action is flagged red.
  - Ticked lines are then added. The assessment says "Read from <assessor>'s report of <date>, checked by <name> on <date>".
  - Each action can then become a maintenance job (answer 7).
- **For the office, adding also does what putting a report up on the live register did:** the report's record (`raReports`), and its review check recorded to the next review date.
- **`raAiStatus`** says whether reading is set up, working, or at today's limit.
- **Rules:** `raReads` is read like the assessment and written by the function only. The assessment's `source` is allowed. Rebuilt.

**Checked:** one quick run on the emulator, with a stand-in AI. The office reads a report:
- the phone number and socket covers are left out, and the missing "people at risk" heading shows as a gap
- nothing is added before the check
- a words-only finding waits for its numbers
- once added, the label, the report record and the review check are there
- a plain member is refused

All 11 passed.

**Deploy (the reviewing window's):** `raReadReport` and `raAiStatus` (new; use CHQ_ANTHROPIC_API_KEY, already set; no new secret). The real call on a real report only on your word.

**For the synthetic parish:** its fire safety lead reads the professional's fire risk assessment of St Hild. They check the lines, and the PCC countersigns.

### F-301 — H&S step 5: events, room hire and away events at any age; and a building's fire safety lead sets its roll call (F-280 sections 3C and 3D; Martin's answers 4, 5 and 6; the away-events plan accepted 27 Oct) (the events window, 28 Oct)

**Built:**
- **event-ra.html, an event's own assessment** (`raEvents/<eventId>`), reached from Events ("Health and safety", marked "(needed)" when it is).
  - **It refers back to the building's assessments,** by their date and colour only (`raStatus`, written with each change; F-280 10.8), and adds what the event changes.
  - **The hub's own rows:**
    - the people expected against the rooms' fire maximums ("must not go ahead as described", which blocks signing)
    - the building's assessments not countersigned or overdue
    - candles, pointing to the building's fire assessment
  - **Kinds:** a gathering, concert, fair, wedding, baptism, funeral, hirer's event, day trip, weekend away or retreat, and adventurous activities. Each has its own required questions, with flags for flames, food, alcohol, the outdoors, equipment brought in and licences.
  - **Who signs:** the organiser, once every question is answered. Then the health and safety lead or deputy approves (answer 5).
  - **When one is needed** (answer 4): the organiser asks, 100 people (the setting), a flag, an outside hirer, or **away from our buildings or overnight, at any age.**
- **Away events:**
  - **The venue:** its own fire arrangements and risk assessment are read from its document, its web pages (the same safe web reader) or pasted words. A person checks each line, and the gaps say what to ask the venue.
  - **The questions:** the overnight and travel questions that aren't about children.
  - **Care or support:** one question, "Is anyone coming who may need care or support?" A yes asks for general words only (the page refuses a phone number or email), and lets the safeguarding lead or deputy read the assessment.
  - **Under-18s:** the safeguarding assessment still applies. The two link both ways and are never merged.
- **Room hire (answer 6):**
  - The office ticks, in Health and safety settings, which kinds of booking need the hirer's own risk assessment.
  - On Room bookings, the office puts it up. It is read and checked against the building's significant hazards, and the number booked against the room's fire maximum. The office then confirms it (`raHire`).
- **`raReadReport` reads venues and hirers' assessments too** (no new secret). `raAiStatus` answers for each.
- **The last old caps:**
  - an event's team, 30 → 500, and the page says when it's full
  - audiences, 30 → no limit, asked 30 at a time (`EGBCEvents.anyOf`)
- **Folded into step 4, as asked: a building's fire safety lead sets its fire roll call** (Martin, 27 Oct). That building only, never "every building", in the page and the rules. Health and safety settings shows them only that list.

**Checked:** one quick run with a stand-in AI, all 12 passed:
- the choir trip's venue words are read, its gaps shown and its lines checked
- care: yes; the organiser signs and the lead approves
- a party hire: 60 booked against a room of 40, and the hirer's assessment misses the steps and first aid; confirmed by the bookings admin
- St Hild's fire lead sets St Hild's roll call and is refused another building's

**For main:**
1. **app.html:** egbc-events.js to `?v=202610281600` (`anyOf`).
2. **The audit's page list:** add event-ra.html.

**For Comms:** comms.html, team-mail.html, cardmaker.html, my-messages.html, give-regularly.html, giftaid.html, rota-reports.html, picture-library.html and watch-admin.html load egbc-events.js. Please bump it to `?v=202610281600` when you next touch them. They work with the old one.

**For the synthetic parish:**
- **Its choir trip:** away, with under-18s, so linked to its safeguarding assessment. The venue is read; the trip leader signs; St Hild's lead approves.
- **Its funerals and weddings** ask about traffic and the churchyard.
- **Its parties** need the hirer's own assessment.
- **Its PCC away day and the pilgrimage abroad** are away events: no safeguarding unless under-18s go. The care question is the only part that can involve the safeguarding lead.

**Deploy (the reviewing window's):** `raReadReport` and `raAiStatus` (changed), and `sgRequirementsFromLinks` and the other sg-ai.js functions (`realDeps` is exported now; nothing else changes). The rules go live when the hub goes live.

### F-302 — H&S steps 6 and 7: the dials and the A4 print; the AI first drafts (F-280 sections 5 and 7) (the events window, 28 Oct)

**Step 6, the dials and the print:**
- **The live risk register's first tab has six dials,** from the hub's own numbers (egbc-hs-dash.js):
  - the fire assessment in date
  - the health and safety assessment in date
  - the checks in date (%)
  - actions overdue
  - open safety jobs
  - the required questions answered
- **ra-print.html prints a building's assessment** (`?site=&kind=`) **or an event's** (`?event=`) on A4, with the safeguarding print's shared pieces:
  - DRAFT until countersigned (a building's) or approved (an event's)
  - a row of dials, then who signed, who countersigned or approved, and when
  - the red box for anything that must not go ahead (an event's hub rows)
  - the "not legal advice" words
  - each section, with the rooms' fire maximums and the fire checks' colours
  - the risk table in words, the action plan with priorities and dates, and the required questions
  - an appendix for a report or a venue that was read
  - signature boxes
  - "Print" links on both assessments and on the register.
- **The fire assessment counts the agreed personal evacuation plans,** never naming them. peeps.js keeps `raCounts/peeps` (F-299's found item).

**Step 7, the AI first drafts:**
- **A new function, `raDraftAssessment`,** drafts a building's health and safety or fire assessment, or an event's, from a plain description.
  - Same plumbing, caps and log as the reader; no new secret.
  - The hub's own facts go with it: the rooms' fire maximums, the checks and their colours, and counts. Never names.
  - A description with a phone number, email, postcode or name is refused, and socket covers are left out and counted.
- **The draft comes back to the page, never saved by itself:**
  - It is labelled "First draft by AI: check every line". The hub does the sums from the AI's numbers.
  - An overdue check becomes a hub action, whatever the AI says.
  - Its answers to the required questions are suggestions, each with "Use it". They never count by themselves.
  - Saving is the person's check: "First draft by AI, checked by <name> on <date>", on the page and the print.
  - What the AI says must not go ahead is shown in red, to check. The hub's own rows still block an event's signing.

**Checked:** one quick run, with a stand-in AI, all 13 passed:
- the evacuation plan count
- the building draft: labelled, socket covers left out, a suggestion used, saved as checked
- the six dials
- the building print
- the event draft, with its must-not
- the hub row still blocking
- the event print with its red box
- a plain member refused, and a phone number refused

**For main:** the audit's page list: add ra-print.html.

**For the synthetic parish:** its Parish office describes St Hild in plain words and gets a first draft that already knows the tower, the kitchen and the overdue checks. It checks every line and saves. The PCC then signs a printed copy for the paper file.

**Deploy (the reviewing window's):**
- `raDraftAssessment` (new)
- the peepToday* functions (peeps.js now keeps the count)

The rules go live when the hub goes live. A real AI call only on your word.

---

### F-303 — A room made of four parts: requests, and instant booking in a church's own hub (the reviewing window's job 1, 29 Oct) (the events window)

**Which it was:** two different things. F-298's `users.jobs` fixed the office's instant booking in EGBC's hub. A probe (both rulesets, every way of booking a 4-part hall) found three still refused:
- **a request** (members, bookings admins, the office): over Firestore's 10-read limit (each part's day, and each part's record for its weekly pattern)
- **a public hire request:** the same
- **instant booking in a church's own hub** by the office or a bookings admin: over the 1,000-expression limit (each part's closed day)

**Fixed:**
- **A request** reads each part's day where it has been written, not each part's record or closures. A request holds nothing: approving it marks every part's day, and the rules check each part fully then.
- **Closing a part closes every room it is part of** (the whole hall), as `wholeIds` on the closure. Lifting it reopens them, unless another of the hall's parts is still closed that day. So booking the whole hall checks the hall's own closed day only. Rules: `partMarked` no longer reads each part's closures; `roomOpen` builds its path once; `roomClosures` and `roomClosedDays` take `wholeIds` (20 at most).

**Probe, after:** all allowed in both rulesets (a team leader's, a bookings admin's and the office's request and instant booking; a public hire request), and an instant booking of a closed hall refused.

**For main:** app.html loads `egbc-events-bookings.js?v=202610141700`; please bump it to `202610291000`.

**Deploy:** nothing. The rules go live when the hub goes live.

---

### F-304 — Job 2: H&S reminder emails; under-18 teams from the teams' own tick; activity leaders read their activity's risks; filming consent; consent per term (the reviewing window's items 5, 8, 6, 7 and 9, 29 Oct) (the events window)

**5. Reminder emails** (`raRemindersDaily`, functions/ra-reminders.js; every day 08:15, with building compliance on):
- **A building's H&S or fire assessment:** review due within 6 weeks, to its lead and the H&S deputy, once. Overdue, the same, once a month until reviewed. The fire assessment's lead is the fire safety lead, or the H&S lead when there is none.
- **Signed, not countersigned:** to the trustees (the trustees job's teams), after 2 days, then every 2 weeks while it waits.
- **An event's assessment signed by its organiser, not approved:** to the building's H&S lead and deputy, 14 days before the event, and again 2 days before.
- Each email is sent once (`raReminded/{key}`, server only). Each says what and when, with the link, and never the assessment's contents. With no hub address, nothing is sent and the log says why.

**8. Under-18 teams** (functions/under18-teams.js; triggers `under18OnTeam` and `under18OnTeamChurch`): one record, `teamFlags/under18 { teams }`, kept from each team's own tick (`teams/{id}.under18`, which Teams and groups already sets), plus EGBC's five, as egbc-auth.js does. Archived teams are left out, and there are 100 at most.
- **For main (your section of the rules):** `under18Teams()` could read it, keeping EGBC's five as the default:
  `let p = /databases/$(database)/documents/teamFlags/under18; return exists(p) ? get(p).data.teams : ['Kids Church', 'Youth Worship', 'Lazers', 'ReNu', 'Kids & Youth Core Team'];`
  That's one more read where the rota checks an under-18s slot. tests/check-under18-teams-agree.mjs would then compare the default instead.

**6. An activity's own leaders read its risks**, read only. They are the leaders (`leaderIds`) of the Sunday group, planner group or small group the register's activity is linked to.
- **Rules:** `sgActivities` and `sgRisks` reads; leaders can't write.
- **Safeguarding risks** shows such a leader only their activities, with "Read only. The register is kept by the safeguarding lead and deputy".
- **For main:** the Menu's `sgRisk` flag hides the page from them. Could it show for anyone who leads a group (`kidsGroups`, `planGroups` or `smallGroups` `leaderIds`)? The page says plainly when someone has nothing there.

**7. Filming consent, separate from photos:** the consent forms ask "May we take photos that include them?" and "May we film them? (video, including a service that is recorded or streamed)". Kids admin and the door show "No filming" and Filming Yes/No. A form answered before this asked "photos or video" as one question, so that answer counts for filming too.

**9. Consent per term, as a setting:** "End of the term" is a new choice for how long an answer lasts, in Safeguarding settings (each kind of form) and on each form.
- **The end of the term** is the site's own term dates, where its Kids lead has set them (copied onto the form when it is saved). Otherwise it's 31 December, 31 March or 31 August, as the registers count terms.

**Quick check** (emulator, both rulesets for the rules): 12/12.
- The reminders: three sent to the right people; each only once; overdue sends a new one; nothing without a hub address.
- The under-18 record.
- A leader reads their activity and its risks; someone else can't; the leader can't change one.

**For main:** in app.html, `egbc-events-kids.js?v=` to `202610291200` (and the bookings stamp from F-303).

**Deploy (the reviewing window's):** `raRemindersDaily`, `under18OnTeam` and `under18OnTeamChurch` (new). No new secret. The rules go live when the hub goes live.
