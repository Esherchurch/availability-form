# Findings — one app, one sign-in

Numbered for the Code windows. Every claim about existing code was made after
opening the file named, and every measurement was taken in the emulator with
`firestore.rules` loaded.

Step B (One app — Chunk 1) opened 2026-10-06.

---

## A-001 — the route, measured rather than assumed

`ONE-APP-BRIEF.md` §8.1 offers two candidates and asks for one to be proved or
ruled out. Both were tried on one page, reading a document the rules only let
an active member read, in the emulator with the rules loaded:

| What the page's data connection was | Rules said |
|---|---|
| the shared compat connection (`EGBCAuth.db`) | **allowed** |
| a modular app with a name of its own — **what 34 pages do today** | **denied** |
| a modular app named `egbc`, no modular Auth created | **denied** |
| a modular app named `egbc` **with** a modular Auth, awaited | **allowed**, and the same uid |

So **candidate (b) as written does not work**. Calling
`initializeApp(sameConfig, 'egbc')` is not enough on its own: the name decides
which stored session is read, but something has to read it. Without an Auth
instance for that app there is no token and the request goes out anonymous.

It does work with `getAuth(app)` and waiting for the session — and that is far
less change than rewriting every modular call into compat, which is what
candidate (a) would mean for the 21 modular pages.

**The route taken**, therefore, is a hybrid, and it is one shared file either
way rather than the same decision repeated 34 times:

- **Modular pages** import `v2/egbc-db.js` — the app named `egbc`, its Auth,
  the emulator hooks, and a `ready` promise. The page drops its own config
  block and awaits `ready` before its first read.
- **Compat pages** use `EGBCAuth.db` / `EGBCAuth.storage()`, which is the same
  connection by another handle. A change of handle, nothing more.

The two denied rows above are also what proves the emulator had the rules
loaded at all: if it had not, everything would have been allowed.

## A-002 — the check that proves it, and the check that did not

`v2/check-firebase-apps.mjs` is in the repo and rerunnable: it lists every
in-scope page that starts a Firebase app of its own, and exits non-zero while
any remain. Step B is finished when it reports zero.

Worth recording, because it nearly went unnoticed: **the first version of the
browser check passed while a page was deliberately broken.** It asked
`egbc-db.js` about itself rather than asking the page, so it answered for the
module no matter what the page did.

What catches it is counting the apps: importing `firebase-app.js` again returns
the *same* module instance the page used, because a browser caches a module by
URL, so `getApps()` lists everything any code on that page created. Exactly
`['egbc']` means the page made none of its own. Put back on its own app,
`view-only-rota.html` reports `[[DEFAULT], egbc]` and the check fails.

## A-003 — `CoreTeamApp.html` was loading the Firebase SDK twice

Lines 4–6 and again at 23–25: `firebase-app-compat.js` loaded twice. The second
load replaces the global `firebase` namespace, which invalidates the app object
`egbc-auth.js` had already created — so `EGBCAuth.storage()` threw
`firebase.storage-compat() takes either no argument or a Firebase App
instance`, and the page's whole script block died at that line.

It only surfaced when the page started using the shared connection; with its
own app it never touched `EGBCAuth`. The duplicate tags are gone and
`firebase-storage-compat.js` now sits with the others.

## A-004 — nine of 38 in-scope pages are on the shared connection; 29 to go

Step B is **not finished**. Moved first, as `NEXT-BRIEF.md` §5 required, because
these were the five writing to the live database:

| Page | Was | Now |
|---|---|---|
| `view-only-rota.html` | own modular app | `egbc-db.js` |
| `addressbook.html` | own modular app | `egbc-db.js` |
| `Planner.html` | own modular app | `egbc-db.js` |
| `SundayServicePlanner.html` | own modular app | `egbc-db.js` |
| `CoreTeamApp.html` | own compat app | `EGBCAuth.db` |

The remaining 29 are the rest of Step B. They are the same two shapes, and the
scripts that did these five are reusable, but each needs its first data call
gating and its main action re-checked, so they are not a blind find-and-replace.

## A-005 — two main actions save nothing, and it is not the connection

With the five on the emulator, the main-action proof could finally be run
safely. Of the seven Group 1 pages:

| Page | Main action | Result |
|---|---|---|
| `view-only-rota.html` | renders the term, builds the full PDF | **pass** |
| `addressbook.html` | adds a person, then edits them | **pass** |
| `SundayServicePlanner.html` | saves the order | **pass** |
| `videos.html` | adds a video | **pass** |
| `resources.html` | adds a link | **fail** — nothing written |
| `Planner.html` | changes an assignment | **fail** — nothing written |
| `CoreTeamApp.html` | changes an assignment | **fail** — nothing written |

Every write is read back from Firestore rather than believed from the screen.

For Planner and CoreTeamApp the select *was* changed and the handler reported
success, but every event document still carries the seed's `updateTime`, so
nothing was saved. **Not yet established** whether the test is aiming at the
wrong control — the role selects may only be the real ones inside an expanded
row — or whether the save is genuinely broken. It is not the connection: both
pages are proved signed in on the shared app and reading under the rules.

`resources.html` has been on `EGBCAuth.db` all along and saves nothing either,
with no alert and no console error.

These three are the next thing to chase, and they belong to Step A2's R-007.

## A-006 — the live database still accepts writes from nobody

Unchanged by this step, and worth keeping in view: an unauthenticated client
can still write to the live project. That is what made the Step A accident
possible and what `firestore.rules` would stop. The rules are not deployed, and
deploying them is Martin's, after the remaining 29 pages are moved — deploying
sooner would lock out every page still on an app of its own.
