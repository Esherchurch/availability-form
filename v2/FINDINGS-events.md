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
