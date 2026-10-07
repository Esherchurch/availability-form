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
