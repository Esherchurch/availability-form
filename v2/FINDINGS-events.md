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
