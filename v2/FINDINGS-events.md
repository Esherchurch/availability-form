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
