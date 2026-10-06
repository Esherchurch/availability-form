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

## A-005 — settled: the test was pressing the wrong control, all three times

Not a page fault, not the connection, and not caused by Step B. Each page saves
correctly when the control a person actually uses is the one that is pressed.

**What the controls really are** (read in the pages, then driven):

| Page | What the test pressed | What a person presses |
|---|---|---|
| `resources.html` | `#linkSave` | `#linkSave` is a **wrapper div**; the button inside it calls `saveLink()` |
| `Planner.html` | a `<select>` offering people | assignment is **drag and drop** (`onDropRole` → `assignPerson`). The only select listing people is `#memberPdfSelect`, which feeds the PDF buttons and writes nothing |
| `CoreTeamApp.html` | a `<select>` offering people | a **role sheet**: `roleTap(eventId, role)` opens it, a person in it calls `doAssign()` |

So the first attempt changed a PDF picker and clicked an empty div, then
reported that saving was broken. The pages were never asked to save.

**How that is known, rather than assumed:**

1. **Driven through the real controls, and read back.** Clicking the button
   inside `#linkSave`, dropping a person on a role box, and tapping a role then
   choosing somebody in the sheet: all three write, confirmed by reading the
   document back out of Firestore rather than believing the screen. 3/3.
2. **A refused write would have shown.** Unhandled rejections, `window.onerror`,
   `console.error` and `alert` were all collected while each action ran. Empty
   every time - which is what a write that succeeded looks like, and not what a
   rejected one looks like, since a refused write rejects its promise.
3. **Not caused by Step B, established by reading** - the pre-Step-B pages talk
   to the live database and must not be run. `git diff c324969e 73a4de00` for
   `Planner.html` is 10 lines in, 15 out, and `CoreTeamApp.html` 6 in, 11 out:
   imports, the config block, the two handles and the duplicate SDK tags.
   `assignPerson`, `doAssign`, `onDropRole`, `saveLink` and every `updateDoc`
   are untouched. `resources.html` has **no diff at all** across Step B - it was
   already on `EGBCAuth.db` - and it failed the same way, which on its own rules
   Step B out as the cause.

**What the writes produced**, as evidence rather than a claim. The two rota
actions landed on the same event in sequence, and the second moved the first:

    ev_2026-10-11  updated 16:41:23   (the seed wrote 16:07)
      Worship Leader=Alex Synthetic, Guitar=Bea Synthetic, Keyboard=Bea Synthetic,
      Drums=Eli Synthetic, Sound=Cal Synthetic, Cameras=Dee Synthetic

The Planner drop put Bea on Worship Leader; the CoreTeamApp sheet then put Alex
there, and because Alex was already on Guitar it moved him and displaced Bea to
Guitar - which is `doAssign`'s documented swap, working.

**The lesson for B2.** A main-action proof has to press what a person presses.
Reading the page for the handler first, and treating "nothing was written" as a
question about the test before it is a claim about the page, is what turns a
red result into a true one. Three of the seven Group 1 "failures" were mine.

## A-007 — deploying the rules will stop the ORIGINAL site saving, not just v2

Checked in the repo root, outside `v2/`: `Planner.html`, `addressbook.html` and
`index.html` there each call `initializeApp` and load **no Firebase Auth SDK at
all** - no `firebase-auth`, no `egbc-auth.js`, no sign-in anywhere. They run on
the **same project**, `egbc-worship-planner`.

So every read and write the original site makes is unauthenticated, and it works
only because the rules are not deployed. Deploying `firestore.rules` would stop
the original site saving on the day it is deployed - not only the v2 pages still
on an app of their own.

That makes the rules deployable **only at the switch-over to v2**, or with rules
that still allow the original site's paths until then. Martin's decision at
launch, and it belongs on the launch checklist (ONE-APP §7) when that page is
built.

## A-006 — the live database still accepts writes from nobody

Unchanged by this step, and worth keeping in view: an unauthenticated client
can still write to the live project. That is what made the Step A accident
possible and what `firestore.rules` would stop. The rules are not deployed, and
deploying them is Martin's, after the remaining 29 pages are moved — deploying
sooner would lock out every page still on an app of its own.
