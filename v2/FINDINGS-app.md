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


## A-008 — thirteen pages were on Firebase 8.10.1, loaded after the compat SDK

Found while moving group 1, and it is why B2 was not a find-and-replace.
Thirteen in-scope pages loaded **Firebase 8.10.1**, the old namespaced SDK,
*after* the 10.12.2 compat scripts. 8.10.1's `firebase-app.js` replaces the
global `firebase`, so the app `egbc-auth.js` had already made on 10.12.2 was no
longer something `firebase` recognised — which is exactly why
`EGBCAuth.storage()` threw "takes either no argument or a Firebase App
instance" on the first attempt.

The compat SDK exists to run v8-style code, so the 8.x tags came out and those
pages keep their `firebase.firestore()` syntax on one SDK. Order matters too:
app, auth, firestore, storage, then `egbc-auth.js`, which needs them all
present when it runs.

## A-009 — inventory-system-2.html had never run in v2

It declares `const db` twice inside the same function. That is a SyntaxError,
which kills the whole script block, so the page loaded and did nothing at all.

Present since `39273a50`, the original v2 import — `git log -S` puts it there,
and the duplicate is in the file before any of this work. Fixed, because a page
nobody can use is broken in front of a user rather than a finding to schedule.

## A-010 — Performancenotes was offline-first, and that had to move

It set up `initializeFirestore` with a persistent local cache so it keeps
working when the church wifi drops mid-service. That could not stay on the
page: `initializeFirestore` has to run before anything calls `getFirestore` on
the same app, and the app is now shared. So the cache moved into `egbc-db.js`,
with the same fallback for private windows and older iOS.

Every modular page gains the cache; nothing loses it. Worth knowing it is now
suite-wide rather than one page's choice.

## A-011 — data-tools keeps a second app on purpose, and the gate says so

`data-tools.html` restores a backup into a **different Firebase project**, so it
opens a second, named app against whatever project the person types. That is
not the problem this work is about, and removing it would break restore — the
first pass of the converter did exactly that, ate 120 lines, and was reverted.

The gate now counts an app whose config carries no `egbc-worship-planner`
literal separately, and prints it, so it stays visible rather than hidden:

    in scope, starting their own Firebase app : 0
    apps opened against ANOTHER project       : 1   (data-tools restore target)

## A-012 — login.html and youth-access.html were already half-right

Both built the **same named app**, `egbc`, deliberately — sign-in has to land on
the instance the guard reads, and the comment in `login.html` says so. What they
lacked was `egbc-auth.js`, which owns that app and carries the emulator hook. So
on localhost they reached the live database, which is the finding first recorded
in Step A and is now closed: `login.html` signs in against the emulator, on the
shared app.

## A-013 — what B2 did not prove

Every in-scope page is proved to be on the one signed-in connection, talking to
the emulator, signed in, readable under the rules and throwing nothing — 240
checks across 48 pages.

What is **not** proved for all of them is each page's main action end to end.
That was done for the seven Group 1 pages and the four knowledge-base pages;
for the rest, the connection is proved and the page loads clean, which is
weaker. Ordinary use will cover far more of it than a script can, but it should
not be read as more than it is.

## A-006 — the live database still accepts writes from nobody

Unchanged by this step, and worth keeping in view: an unauthenticated client
can still write to the live project. That is what made the Step A accident
possible and what `firestore.rules` would stop. The rules are not deployed, and
deploying them is Martin's, after the remaining 29 pages are moved — deploying
sooner would lock out every page still on an app of its own.

---

# Chunk 2 — the hub as the main app (Step D)

## A-014 — the companion app names, ready for Martin to confirm one at a time

The hub is renamed, because that name was already decided: **EGBC Hub**, in
`manifest-hub.json`'s `name` and `short_name`. `id`, `start_url` and `scope`
are untouched, so a phone that already has it installed keeps it.

The six companions are **not** renamed. Each needs Martin's word, so here is
what each one is called now and what it would become:

| Manifest | On the phone now | Proposed |
|---|---|---|
| manifest-coreteam.json | Core Team v2 | Core Team |
| manifest-planner.json | Rota Planner v2 | Rota Planner |
| manifest-service.json | Service Planner v2 | Service Planner |
| manifest-youth.json | Youth Hub v2 | Youth Hub |
| manifest-youthservice.json | Youth Planner v2 | Youth Planner |
| manifest-availability.json | Availability v2 | Availability |

In every case it is only the "v2" that goes, and only from `short_name` - the
long `name` already reads "EGBC Core Team" and so on. Say the word on any of
them and it is a one-line change each.

A renamed app does not rename itself on a phone that already has it: the
label is taken when the app is installed. Anyone already using one will keep
seeing the old name until they remove it and add it again. That is worth
saying in the message that announces the change, rather than being a surprise.

## A-015 — what cannot be checked from here: the real-phone tests

Three things in this chunk can only be settled on Martin's own iPhone and
Android phone, and none of them should be reported as done until they are:

1. **Does signing in to one app sign you in to the others?** Each installed
   app may get its own storage, in which case each needs signing in once.
   Firefox and Safari differ from Chrome here, and no emulator answers it.
   *To test:* install EGBC Hub and Core Team from the home screen, sign in on
   the hub, open Core Team. If it asks again, that is the answer - say so and
   the sign-in gets a one-tap "continue as" rather than a fresh form.
2. **Does a video call work inside the installed app?** Camera, microphone,
   screen share, leaving and rejoining, on both phones, from the hub's Meet
   tab. iOS has refused camera access inside installed web apps in the past.
3. **Does the tab bar sit clear of the home indicator?** It is written with
   `env(safe-area-inset-bottom)`, which is the right thing, but only a real
   iPhone shows whether it worked.

Everything else in this chunk is proved in the emulator against a headless
Chrome at 375px, which is not the same thing and is not claimed to be.

## A-016 — the hub has its own Menu, and the shell's "Apps" heading missed it

The brief asks for an "Apps" heading in the Menu. There are two menus: every
other page uses `egbc-shell.js`, and the hub - the main app - has its own,
built into `hub.html` and `hub-app.js`. The first version of this put the
heading in the shell only, which left it out of exactly the app it matters
most in. Found by opening the Menu on the hub and finding no heading at all.

Both now draw it from one list, `EGBCUI.APPS` in `egbc-ui.js`, which is the
file both already load. Two menus is the thing to fix one day; one list is
the thing that stops them drifting in the meantime.

## A-017 — "My serving" is read-only, on purpose

`ONE-APP-BRIEF.md` §5 describes this card with a "can't do it" action on each
date, going to unavailability. `NEXT-BRIEF.md` §10 then says accept/decline is
not wanted - volunteers will not use it, and the availability form already
gathers what the planner needs. §10 is the later decision, so the card shows
what is coming and nothing more. Worth knowing the briefs disagree, so that
the next person reading §5 does not build it.

## A-018 — "Waiting for you" has one kind of item today

The card is built and works: a notice that has to be confirmed as read
appears, Confirm writes the acknowledgement, and the card goes when there is
nothing left. That is the only item that exists today - forms, approvals and
payments all belong to chunks not yet built, and rota accept/decline is not
coming at all (A-017). Each later chunk adds to `waitingItems()` rather than
building a page of its own, which is what the one-dashboard rule asks for.

## A-019 — two pages are still on Montserrat, and were before this step

`birthday.html` and `youth-access.html` compute to Montserrat rather than
Inter. Proved to pre-date this step by stashing these changes and measuring
the same two pages again: the same answer. They are Group 4 in the restyle
brief and are due there.

The same sweep is the lock-out check for this step: 32 in-scope pages, 128
checks, every page loads, renders, keeps its controls and throws nothing.
`login.html` sends a signed-in person to the hub, which is what it is for.

## A-020 — Storage had no emulator, so development uploads went to the live bucket

Found while fixing F-016. `egbc-auth.js` pointed Firestore and Auth at the
emulators on localhost and left Storage pointing at the real bucket, so every
upload made while developing - knowledge base videos, the team shelf, banners
- went to the live one. Now hooked, and proved by watching what leaves the
browser rather than by reading the code: the event picture goes to
127.0.0.1:9199 and nothing goes to firebasestorage.googleapis.com.

**Martin may want to look in the live bucket** for files put there by
development before today: `banners/`, `resources/` and `kb/` are where they
would be. Nothing is deleted from here without being asked.

## A-021 — where the church's own details are written into the code

Martin, 8 Oct 2026: this will become a product other churches use, so nothing
built from now on may hard-code the church's name, its email addresses or its
logo. Those come from the **Church details** setting the events window is
adding.

**Nothing has been changed.** This is the list, as asked.

### The name: "Esher Green Baptist Church"

26 times, in 18 files. Three kinds of use, and they are not equally awkward:

| Where | Count | What it is |
|---|---|---|
| the shell and the hub (`egbc-shell.js`, `hub.html`, `hub-app.js`) | 4 | the strapline under the title on every page |
| email templates (`Planner`, `CoreTeamApp`, `SundayServicePlanner`, `youthserviceplanner`, `EmailBuilder2`, `hub-app.js`) | 11 | the sign-off and the header of what goes out |
| page titles and headings (`index`, `login`, `hire`, `videos`, `whatson`, `meeting`, `youth-access`, `EGBC-PlayThrough`) | 11 | what a person reads at the top |

`egbc-ics.js` has it three times as the calendar's name and in `PRODID`.

### Email addresses

| Address | Count | Where |
|---|---|---|
| `worship@esherchurch.org` | 22 | the reply-to on nearly every email the suite sends |
| `av@esherchurch.org` | 3 | AV emails |
| `youth@esherchurch.org` | 2 | youth emails |
| `office@esherchurch.org` | 2 | the fallback on public pages |
| `EGBCWorship@callasuite.uk` | 3 | what the send service posts **from** — the Calla window's, not ours |

`esherchurch.org` also appears 28 times as a bare domain, mostly inside the
`UID` of calendar entries (`egbc-rota-<id>@esherchurch.org`). **Those must not
simply be swapped**: changing a UID makes every calendar treat the entry as a
new one, so the old one stays behind and people get it twice. Whatever the
setting does here needs a rule for calendars that already exist.

### The logo and the header image

Six files at the root of the storage bucket, referenced 37 times:

| File | Count | What it is |
|---|---|---|
| `1774936285076.png` | 21 | the logo, on most pages and in every email |
| `copilot_image_1775806874083.jpeg` | 8 | the shell and hub header |
| `1777880144841.png` | 4 | the training portal's |
| `1774933429062.png`, `1774933729776.png`, `1774936402880.png` | 4 | the old portal's dashboard |

Declared as a constant in five places — `egbc-shell.js` (`LOGO`), `hub-app.js`
(`LOGO`), `EGBCWorship&AV.html` and `trainingportalhub.html`
(`DEFAULT_LOGO`), `trainingrotaplanner.html` (`LOGO_URL`) — and inline in the
rest. The five constants are the easy half; the inline ones in email templates
are the work.

They are also named one by one in `storage.rules`, so that the availability
form and login can show the logo with nobody signed in. A church that uploads
its own logo will need that rule to be about a folder rather than six names.

### The video rooms

`https://egbc.daily.co/` is the base for every meeting link, in 7 places,
with a room per meeting kind (`worship-core-team`, `Worship-AV`, `Prayer`,
`Eldership`, `CMM`, `kids-ministries`, `interviews`). That is a second account
belonging to the church, not just a name.

### What I would say about the order of work

The email templates are the biggest share and the hardest, because the name,
the address and the logo all appear inside one block of HTML that is built as
a string. The shell, the hub and the page headings are a handful of constants
and would take an afternoon. The calendar UIDs should be left alone until
somebody has decided what happens to calendars people have already added.


## A-022 — Step N left four registry renderers with no callers

Found while retiring `EGBCWorship&AV.html`. I added a guard so that a leftover
`hubPages` row could not draw a tile for a retired page, and removing the guard
again changed nothing — because the function it was in is never called.

Nothing anywhere calls `isTile`, `visibleOne`, `visibleTools` or `nestTools`.
They were how the hub turned registry rows into the Menu. Step N replaced that
with `egbc-menu.js`, and the old renderers were left behind.

**Why it matters.** It is not a fault a user can see; the hub behaves correctly.
It matters because the code now reads as though the registry still decides what
appears in the Menu, and it does not. `nestTools` in particular carries a long
comment about nesting imported menu items that describes behaviour the hub no
longer has. The next person to ask "why doesn't my registry entry show up?"
will read all four and be none the wiser.

The registry is still live and still needed: Administration → Pages reads it,
`SHARED_PAGES` reads it, and the link checker reads it. It is only the four
renderers that are unreachable.

**What I would do.** Delete the four, with one line where they were saying the
Menu comes from `egbc-menu.js` now. No test in `v2/tests/` mentions any of
them, so nothing would have to change with them. I have not done it because
deleting code is not what this step was for, and it is a tidy-up rather than a
fix - it should go in with the next piece of work on the hub's tools panel.

## A-023 — the style check reported a clean sweep over six pages it never opened

**This one corrects a number I gave Martin.** The Step N2b report said
`check-style-every-screen` found 0 problems across every screen. It did say 0.
It was not measuring six of the screens.

**What happened.** The check signs in as one invented account and walks every
page. Six pages are behind a gate — Core Team, admin, or leader access for a
team. The account had none of those, so `EGBCAuth._blockPage()` replaced the
body with its refusal card, and the check measured the card.

The card breaks three DESIGN.md rules of its own (an 11px line and two 10px
uppercase pills), so some runs scored 9, 12, 15, 57 — numbers that had nothing
to do with the page and sent me looking for a regression in the events window's
work that was not there. **And some runs scored 0**, because a page is only
measured for the rules it can break, and a door that shows three elements can
break at most three. Six unopened pages and six clean pages are the same number
on the page this prints.

**Why it moved about.** Every check that drives the hub rewrites that one
account's profile. `check-menu.mjs` reads the Menu as three different people and
leaves it as the last of them. Whether a page opened therefore depended on which
check had run last — which is why the same commit measured 0 one hour and 108
the next, with no code having changed. I confirmed that by running the sweep in
a worktree at the exact commit I had reported 0 on: it gave 108.

**Fixed.**
- `egbc-auth.js`: `_blockPage()` marks the body it replaces with
  `data-egbc-blocked="<the title>"`. One attribute, no guessing, and anything
  else that walks pages can use it. (The first attempt put it in the "Which of
  you is this?" picker instead, and the probe quietly kept reporting no door —
  a reminder that two functions in a file can both end in `document.body.
  innerHTML =`.)
- `tests/check-style-every-screen.mjs`: a page showing a door is named, not
  measured, and listed under "PAGES THIS RUN NEVER SAW. The number above is not
  about them."
- `tests/README.md`: what the invented account needs. `roles: {team: "owner"}`
  is the one that is easy to miss — `adminFor` and `masterAdmin` do not clear a
  `data-role="leader"` gate, which is what the Rota Planner and the Sunday
  Service Planner use.

**The real answer, with every page open: 0 across all twelve, no console
errors.** So nothing was broken. What was broken was the gate, and a gate that
cannot fail is not a gate.

**Also found on the way:** I had left a junk `users/197609` document in the
emulator from a mistyped shell command (`UID` is read-only in bash, so the
write went to the literal string). Deleted. It is worth knowing that the
profile-setting helpers find a user by email and will happily pick the wrong
one of two.

## A-024 — the Menu was right on the hub and wrong everywhere else

Martin, 9 Oct 2026, looking at the live `whatson.html`: the Menu differs
between pages.

**It did.** `egbc-menu.js` — the structure he approved in Step N — was loaded
by `hub.html` and by nothing else. Every other page gets `egbc-shell.js`, which
built its own Menu out of the registry: groups called Apps, Everyone, AV, Core
Team and Worship, the pages sorted by team. Two arrangements of the same pages,
on 55 pages against one.

**Why Step N did not catch it.** `check-menu.mjs` read the Menu on the hub,
three times, very carefully — and the hub was the one page that was right. The
check was thorough in one place and silent everywhere else, which is a shape
worth recognising: a gate that looks rigorous because of how hard it works on
the sample it happens to have.

**Fixed.**
- The markup **and the look** are now in `egbc-menu.js` (`EGBCMenu.paint`).
  Both the hub's panel and the shell's call it — not two renderers kept in
  step, one renderer. The CSS moved with it, so there is one copy of that too.
- `egbc-shell.js` loads `egbc-menu.js` itself, so **no page needs a script tag
  for it** and a page nobody remembers to update still gets the right Menu.
- The shell's grouping is gone: `groupOf`, `groupInfo`, `groupOrder`,
  `maySee`, `pageTeams`, `installedApps`, the Apps heading and the `.en-g` /
  `.en-i` CSS that drew them. The registry is still read, for one question
  only: has an admin switched this page off.
- The shell's version stamp is bumped on all 55 pages and in `version.json`,
  so browsers fetch the new copy rather than the cached old one.

**`check-menu.mjs` now opens the Menu on every page** — 77 looked at, 55 with a
Menu — and compares it name for name with the hub's. Pages with no Menu are
listed with the reason (public pages, phone apps, out-of-scope apps), and a
page that falls out of that list fails the check.

**Two things the rewrite broke, and which assertion caught each.**

1. Taking the old grouping out took `window.EGBCShell` with it, so every page
   had a Menu button that did nothing. The **name-for-name comparison passed** —
   a page with no Menu has no names to disagree about — and the failure came
   from "every page that should have a Menu has one". The quiet assertion was
   the one that mattered, which is the second time in two days that has been
   true (see A-023).
2. The same cut took `closeNav`, so the panel could be opened and not shut.
   Caught by the same probe, one line further on.

Both are the same mistake: deleting a range by its end marker rather than by
what is in it.

## A-025 — WITHDRAWN. I was wrong about the Youth Service Planner

**What I wrote, and what is actually true.** I reported that
`youthserviceplanner.html` has no sign-in at all, and asked Martin to decide
whether to give it one. He checked. It imports `egbc-db.js` and awaits
`ready`, on the same named app as everything else, so it signs in exactly
like any other page. There is nothing to decide.

**What was really wrong.** It does not load `egbc-auth.js` — the compat-SDK
file the Menu reads `EGBCAuth.profile()` from. One page with a different
SDK, not a page with a different rule. The Menu asked the only way it knew
how, got nothing, and drew a stranger’s Menu.

**How I got there.** I grepped the page for `firebase` and `EGBCAuth`, saw
two matches, read the `<head>`, and concluded. I did not read the module at
the bottom of the file, which is where the page does all its work. The
evidence for “no sign-in” was the absence of the thing I had searched for,
which is not evidence of anything.

**Fixed.** `egbc-shell.js` now works out who is signed in either way: from
`EGBCAuth` where the page has it, and otherwise from `egbc-db.js` and the
same `users/{uid}` document `egbc-auth.js` mirrors its own profile from — so
the same person gets the same Menu whichever SDK the page uses. The registry
read works both ways too. The module is imported as `./egbc-db.js` with no
version stamp on purpose: the page imports that exact specifier, and a
different URL would be a second copy of the module with its own auth
listener.

The “signed out on purpose” list in `check-menu.mjs` is now empty, and that
page is held to the same name-for-name comparison as the other 54.

## A-026 — "Powered by Church HQ", and the one switch

§19 built. `egbc-poweredby.js` holds the line — the doorway mark from
`brand/church-hq/svg/mark-light.svg` at 16px, then "Powered by Church HQ" in
12px #6b7280, centred — and three places use it: under the sign-in box on
`login.html`, and the bottom of the Menu, which is the shell's panel (so every
page) and the hub's. The events window uses the same file for the public hire
pages.

**The link is one switch.** `LINK` at the top of `egbc-poweredby.js` is empty,
so the credit is plain text. churchhq.co.uk is not live, and a link to a site
that does not answer is worse than no link. Put the address in that one
constant and all three places become links, in a new tab, with nothing else to
change anywhere.

**The words survive the picture.** The mark is an `<img>` that hides itself if
it cannot be fetched, so an old cached page or a folder that did not deploy
shows the credit with no mark rather than a broken-image icon beside it.

**It is checked both ways.** `check-poweredby.mjs` asks whether the credit is
in the three places — right size, right colour, centred, mark beside the
words, no link — *and* whether it has spread: no page writes the words in for
itself, and `egbc-email.js`, `egbc-events.js`, `egbc-ics.js` and
`egbc-rota-pdf.js` do not mention Church HQ at all. The risk here is not that
the credit goes missing; it is that it ends up beside the church's own logo in
a header, or on an email. 24/24.

**One thing the check caught in itself**: it opened `login.html` while signed
in, and `login.html` sends a signed-in person straight to the hub. So it
photographed the hub and reported the credit missing from a page it had never
opened — the same shape as A-023, a fortnight's lesson arriving again within
the day. It signs out first now.

**Two faults it surfaced in the Menu** while measuring it:
- The "You are here" marker was a block, which made a Menu row three lines
  tall and left the icon no longer level with the first of them. The icon
  check calls that "icon on its own line" and it said so. It is inline now.
- A heading that is also a page — Worship & AV, Youth, Core Team, each linking
  to its charter — had no underline, so it read as a heading rather than
  something you could press. That is the fault Martin hit from the other side
  when he could not find the charters. Dotted underline at rest, solid on
  hover.

## A-027 — the reminder timers, and the three things worth knowing about them

§18's server step: `bookingReminders` (09:00 London) and
`documentExpiryReminders` (09:30), both in the `hub` codebase with the
calendar feeds. The spec is the events window's F-074 and its addendum.

**1. "Tomorrow" has to be a London day, not a UTC one.** A booking's `day` is
a plain `yyyy-mm-dd` written by somebody looking at a calendar. The server
runs in UTC, and from late March to late October those differ for an hour
every evening — and 09:00 London in summer *is* 08:00 UTC, so the run itself
lands inside that hour. Every day in this file comes from
`Intl.DateTimeFormat` with `timeZone: 'Europe/London'`, and there is a check
that 23:30 UTC on 10 June is already the 11th.

**2. A re-run must send nothing.** A scheduled function retries, and a timer
that sends again every time it is poked is how fifty people get the same email
four times. Both runs are checked twice in a row, and the second must add
nothing to the outbox. It is the single most valuable assertion in the file.

**3. Nothing can be sent from the emulator, for two separate reasons.** The
functions write every message to `emailOutbox` and make no request when
`FUNCTIONS_EMULATOR` is set; and every invented address ends `.invalid`, which
`sendableEmail()` refuses. Either alone would do. Both, because this is the
first thing in the suite that writes to people with nobody watching.

`emailOutbox` is not only a test fixture — it is where the real sends are
recorded too, and `SERVER-DEPLOY.md` tells Martin to read it on the morning it
goes live rather than assume.

**What the checks cannot tell him**, and the deploy steps say so plainly: the
emulator never calls `sendEmail`, so whether email actually arrives is not
proved by anything here. The first real test is the Force run in step 8.

## A-028 — Node 20 is decommissioned on 30 October 2026, so the functions moved to 22

The deploy warned it. The part that matters is what it stops: after that date
**nothing in this codebase can be deployed at all** — not a fix, not a
rollback. What is already live keeps running, so it is a deadline on deploying
rather than on the service. That is a worse kind of deadline, because nothing
breaks to remind you.

| | was | now |
|---|---|---|
| Node | 20 | **22** |
| `firebase-functions` | 6.6.0 | **7.4.0** |
| `firebase-admin` | 12.7.0 | **14.5.0** |

Two major versions on each library. Every import this codebase uses still
resolves — `onRequest`, `onCall`, `HttpsError`, `setGlobalOptions`,
`onSchedule`, `initializeApp`, `getFirestore` — checked one at a time before
anything else was run, and then by the checks.

**All three function checks pass on the new libraries**: the rota feed 45/45,
the calendar end to end through the hub 23/23, the reminders 38/38. The two
server-side ones run under `emulators:exec`, which starts a fresh process
against the new `node_modules`; the browser one was re-run after restarting
the dev emulators, so it is not reading a cached copy either.

**The runtime comes from `engines.node`** in `functions/package.json`. There is
no `runtime` in `firebase.json` and no flag to pass — the emulator confirms it
by echoing *"Your requested node version 22"*, which it did not say before.

**What none of this proves.** The emulator runs functions on whatever Node the
machine has, which here is 24, and says so. So the checks show the code works
on the new **libraries**, not on Node 22 in particular. Nothing in these five
functions touches anything that differs between 22 and 24 — they use `fetch`,
`Intl`, `crypto.randomBytes` and plain JavaScript — but the first true test of
the runtime is the deploy itself. `SERVER-DEPLOY.md` says that plainly and
tells Martin what to look for in the CLI's output (nodejs22 against each
function, and no offer to delete `sendEmail`).

**`monitor-bridge/package.json` says `>=18`** and was left alone: it is a local
development tool and is never deployed.

## A-029 — F-089: the children's register goes under a Kids Church heading, not inside Core Team

F-089 asked for "Children's register" (`kids-admin.html`) "for the children's
team and admins, **near Safeguarding**", and Safeguarding was pencilled in
under **Core Team → Events and rooms** (F-031). Martin offered either that or
a Kids Church heading and asked which.

**A Kids Church heading, beside Worship & AV and Youth.** Three reasons:

1. **Events and rooms is about rooms and events** — Events, Places, Room
   bookings. A register of children is neither.
2. **The people who need it are not on Core Team.** A Kids Church leader would
   reach their own register through a heading called Core Team and then one
   called Events and rooms — two headings about somebody else's work, neither
   of which says what they are looking for. That is the exact complaint Martin
   made about the Menu in the first place, and the reason Step N exists.
3. **It would be the second thing bent into that shape.** Room bookings
   already sits under those two headings while deliberately *not* being gated
   on Core Team, so its people get through headings that are not theirs
   (A-024). Once is a workaround. Twice means the structure is wrong.

Kids Church has a charter but no page of its own, so the heading is a heading
only. **Safeguarding and Check-in belong here too** when the events window
ships them, rather than under Events and rooms — that is a change to F-031's
plan and it is theirs to accept or argue with.

**Who sees it.** A new, reusable `team: 'X'` flag on a Menu entry: somebody on
that team, the person who administers it, or a master admin. **Not every
admin** — whoever looks after Worship is not the children's team, and a Menu
that offers everybody everything is the wall this replaced. If Martin meant
"anyone who administers anything", it is one word in `visible()`.

**`check-menu.mjs` reads the Menu as two more people**: a Kids Church leader
who is on no other team and administers nothing, and Karen, who administers
Kids Church without being on its rota. Both get the heading and the register;
the Worship member and the bookings admin get neither.

**One thing fixed on the way.** `egbc-shell.js` had its own `whoFromAuth()` —
a second copy of `EGBCMenu.who()`'s three lines — and it had already fallen
behind: `EGBCMenu.who()` now honours "View the site as", so a master admin
previewing as a Worship member sees that member's Menu, and the shell's copy
did not. The Menu would have differed between the hub and every other page
again, quietly, and only for an admin previewing. It calls the one function
now. That is A-024's lesson arriving a second time in the same file.

---

## A-030 — closing the address book and widening `active()` pull in opposite directions

Both were asked for on the same day, and they collide.

PRIVACY-OPEN-COLLECTIONS.md proposed closing `addressBook` to
`allow read: if active()`. NEXT-BRIEF §21 then made `active()` mean **Attender**
— anyone in the address book, which is very nearly the whole congregation.

Done in that order, the fix would have read as done and moved almost nothing:
from "anyone on the internet" to "anyone who comes to this church".

**What was built instead.** `active()` keeps its name and its new, wider
meaning. A second function, `volunteer()`, is *exactly* what `active()` meant
before — `status == 'active'` was only ever written for somebody with teams,
`adminFor` or `masterAdmin` — and the 31 rule lines meant for volunteers were
changed to it in the same commit. **That pass moved nothing on the day it was
made**, which is what makes it safe; what it does is stop those 31 widening
when the meaning changed underneath them.

`addressBook` is now `isAdmin() || volunteer() || bookIsMine(personId)` for a
single record, and `isAdmin() || volunteer()` for a query — a person may read
their own record and nobody else's.

`tests/check-access-levels.mjs` reads the rules back and fails if any of the 28
volunteer-only collections has drifted to `active()`, or if any of the 11
section 21 opens to Attenders has drifted the other way. ACCESS-LEVELS.md is
generated from the same read.

**10 of the 31 changed lines are inside the marked events section** of
`firestore.rules` (`eventLeaders`, `concerns` create, `safeguardingSettings`,
`counters` ×2, `settings/accounts`, `kidsSettings`, `kidsGroups`, `kidsTerms`,
`screenPages`). The standing rule is to leave that section alone. It was
changed anyway, and deliberately: the alternative was to publish the
safeguarding settings and the children's groups to every Attender in the
church. The substitution is behaviour-preserving today, so nothing the events
window has built changes — **but they need to know `active()` means something
new**, and a rule they write next week saying `active()` will not mean what the
rule above it meant.

---

## A-031 — the rules refused a browser holding yesterday's `egbc-auth.js`

The first version of §21's mirror required `attender` and `churchMember` on
every write to `users/{uid}`. Two rules tests that had passed for weeks
started failing: *"a first sign-in writes the membership the address book
gives"* and *"an admin in the book comes back an admin"*.

Those tests write what the **old** client writes. They were not stale — they
were the deploy. A browser still holding the previous `egbc-auth.js` writes the
old shape, `refreshFromBook` swallows the refusal (`.catch(function () {})`),
and somebody signing in for the first time that day would have been stuck
`pending` with nothing on screen to explain it. Rule Zero.

`mirrorsBook` now checks both fields **only if they are present**, and allows
`status: 'pending'` whatever the record says — claiming *less* than the address
book grants can never be an escalation. Both shapes have their own test, and
there is a third proving a cached client still cannot smuggle a wrong
`churchMember` through while it is there.

---

## A-032 — the style check has never looked at the one page the whole church uses

`index.html` is not in `tests/group1-screens.mjs`, so neither the drawn pass
nor the source pass has ever measured it. It has two emoji on its answer
buttons:

```
index.html:231      ✓ Available
index.html:236      ✗ Unavailable
```

Not fixed, because the page has not been restyled and is in no restyle group —
adding it to the check today would fail on the font and the weights as well,
which is a restyle job rather than this one. **It should go into a group.** It
is the only page a member of the church is ever emailed a link to.

---

## A-033 — "the answer he gave is remembered" was reading a variable it could not see

In `tests/check-form-in-browser.mjs`, written the same afternoon:

```js
const remembered = await ev('JSON.stringify(window.availabilityData || null)');
ok('the answer he gave is remembered', /ev_br_one/.test(String(remembered)), remembered);
```

`availabilityData` is module-scoped inside `index.html`'s `<script type="module">`,
not on `window`. It returned `null` — and would have returned `null` whether
the answer came back or not, so the assertion could only ever fail, never pass
wrongly, but it was measuring nothing. The replacement reads the **screen**:
the chosen button is the one `renderDates` gives `bg-green-600`, and the other
one must not have it.

Same family as A-023 and A-024: a check that cannot tell the two outcomes apart
is not a check. Worth saying because it was written *after* that lesson.

---

## A-034 — two things in the rules that are wrong today, found while auditing

Neither is caused by this change; both are in the file now.

1. **`training_portal` is `allow read, write: if active()`.** The practice
   copies of the tools write there, and anybody signed in may scribble on it.
   That is defensible for a sandbox. It is now `volunteer()`, so Attenders
   cannot — but a *write* open to every volunteer is still worth a decision.

2. **An archived person who still has teams ticked stays a volunteer.**
   `attender` is false for them (this change), but `status` is still `active`
   because `markers` is not empty, so they keep their team's pages until an
   admin clears the ticks. Leaving the church does not currently take anything
   away. Untouched: making `archived` override the ticks is a decision about
   people, not a tidy-up.

---

## A-035 — a members-only room can be hidden, not locked

The CMM video room is Church members only now: it is absent from Meetings and
from the hub's meetings card for anybody without the tick, and a pasted
`meeting.html?room=CMM` is refused in words.

**What that does not do.** The call itself is a Daily room at a fixed public
address, `https://egbc.daily.co/CMM`, private only because people knock and a
host admits them. Anybody who already has that link still reaches the knock
screen, and the host admitting them is still the real gate. Making the room
itself members-only is a Daily setting, not something a page can do.

Also: **the tick starts off for everybody**, so on the day this deploys CMM is
invisible to everyone, including the Core Team, until the office ticks people.
That is step 2 of the deploy order in SERVER-DEPLOY.md.

The Core Team app's room picker was deliberately **not** gated. Hiding CMM from
the people who schedule the members' meeting would stop the meeting being
created at all. One line if Martin wants it the other way.

---

## A-036 — closing the address book stopped anybody signing in, and no rules test could have caught it

This is the one worth reading. **637 rules cases passed** on a change that
made it impossible for anybody to sign in to anything for the first time.

`egbc-auth.js` has always found out *who* has signed in by querying the
address book from the page:

```js
db.collection('addressBook').where('email', '==', email)
db.collection('addressBook').where('signInEmails', 'array-contains', email)
```

It has to, because it does not know the person's `memberId` until it has found
them. With `allow read: if true` that worked for anybody, including somebody
with no `users/{uid}` document at all. Closing the collection meant a brand new
account — on no team, administering nothing — had both queries refused,
`provisionProfile` failed, and every page showed **"Something went wrong"**
with a rules error printed on it.

**Every rules test passed because every one of them wrote `users/{uid}` with
the memberId already in hand.** Not one ran the query that produces it. Same
family as A-023 and A-024: the tests covered the write and not the lookup, and
the lookup is the part that locks people out.

**I first wrote that this cannot be fixed in the rules. That was wrong, and I
had put it in two code comments before checking it.** A `list` rule CAN say
`resource.data.email == request.auth.token.email`: Firestore allows a query
whose own `where` clauses guarantee the rule, and refuses one that asks for the
whole collection. Measured five ways afterwards — plain field access, the
`.get(field, default)` form, `array-contains`, both clauses ORed, and an
unconstrained query, which was correctly refused.

What actually broke the two attempts was A-037 below: `active()`, sitting in
the same rule as an `||`, threw on the missing `users/{uid}` document. I read
"evaluation error" and reached for the wrong explanation, which is the whole of
the mistake.

**The lookup is a function anyway**, and the reasons are worth more than the
clause saved: the address book is then shut to page-side queries entirely, with
no clause for somebody to widen later with an `||`, and the function drops
archived and under-16 records itself rather than trusting the page to. The cost
is that signing in now needs a deployed function, which is a real cost and is
in SERVER-DEPLOY.md twice.

So: **`whoAmI`**, in codebase `hub`, beside the
availability form's three. It reads the address out of the **verified ID
token**, never out of the request body, so it can only ever answer about
whoever is asking — which is why it may return rather more than `findMe` does.
It applies the two exclusions `findMembers` used to apply in the page
(`archived`, `isMinor`), so the page is no longer the only thing enforcing
them.

`egbc-auth.js` calls it over plain `fetch` with the ID token rather than
through `firebase-functions-compat`, because that would be a fourth script tag
on sixty-odd pages for one call.

**Consequence for the deploy, and it is a hard one:** `whoAmI` must be live
before the rules are. SERVER-DEPLOY.md says so twice.

---

## A-037 — `active()` threw rather than returning false, for every one of its 72 call sites

Found in the same walk, and separate from A-036.

```
function active() {
  return signedIn() && me().status == 'active';
}
```

`me()` is `get(users/{uid}).data`. For a document that does not exist, `get()`
returns null, and `null.status` is **not false — it is an evaluation error**,
which fails the whole ruleset for that request with "Null value error" rather
than a tidy refusal.

Any rule naming `active()`, evaluated by a signed-in person with no
`users/{uid}` document, threw. That was unreachable **only** because
`addressBook` was open: a brand new account's first act is the lookup above,
and nothing else in the suite is read before the mirror is written. It now
checks `exists()` first.

Worth knowing because it was latent for as long as these rules have existed,
and it would have surfaced the day they were deployed, for everybody, as
"Something went wrong".

---

## A-038 — what an Attender's hub actually looks like, which nobody has seen before

Walked it (`tests/check-levels-in-browser.mjs`). An Attender reaches the hub —
the first time anybody not on a team has — and gets the video meetings card,
the pin board card and Resources. The Rota Planner turns them away in words.
All correct.

But the hub logs **four refusals** to its console on the way:

| | |
|---|---|
| Team panels failed | `teamContent` — volunteers only |
| Meetings load failed | `events` — volunteers only |
| Pin board card: could not read the board | `worshipBoardState` |
| Hero load failed | `pageContent` |

Every one is caught and the card degrades to an empty state, so nothing is
broken on screen. But four red lines in the console is how a real fault hides,
and `tests/smoke-all-pages.mjs` asserts the console is clean — it only passes
because it runs as a master admin.

**Not fixed: deciding what an Attender's hub should show is a design
question**, and §21 says "their own dashboard", which is a piece of work rather
than a tidy-up. What is cheap and worth doing first is to stop the hub
*asking* for things the person cannot have, which removes all four.

---

## A-039 — the brand logo is a live Storage URL on every page

`egbc-shell.js:30` hard-codes
`https://firebasestorage.googleapis.com/.../copilot_image_...jpeg?alt=media&token=…`
and the shell is on every page, so every page served from localhost asks the
**live** bucket for it. CoreTeamApp.html and EGBCWorship&AV.html have more of
the same.

It is a public image with a download token, not data, and the request is
refused by the harness, so nothing has leaked. But it is the same shape as the
fault that put five test records in the live database — a localhost page
talking to live Firebase — and it is the reason
`tests/check-levels-in-browser.mjs` has to name two expected exceptions rather
than assert nothing at all. Named, not fixed.

---

## A-040 — a rule function that was defined and used by nothing

The reviewing window found it. `youthGranted()` was in `firestore.rules`, it
was correct, it was commented, it referred to a document that did not exist —
and **no rule called it**. Under the locked rules a young person's phone (an
anonymous account plus a `youthAccess` document) was refused every collection
`youthapp2.html` reads: `services`, `songs`, `events`, `portal`,
`worshipBoardState` and `addressBook`.

The Youth Hub would have opened and shown an empty shell. No songs, no
services, no board, nothing on screen saying why — because every one of those
reads is wrapped in a `try/catch` that does nothing.

It is the same shape as A-023 and A-024 one level up: not a gate that cannot
fail, but a gate **nothing was wired to**. Nothing could have caught it except
reading the file and asking what calls what, which is what the reviewing
window did. `tests/check-access-levels.mjs` now fails if `youthGranted()`
stops being used, starts being used anywhere outside the seven collections it
is for, or ever appears on a write.

It now grants read on `songs`, `services`, `events`, `portal/dashboardContent`,
`kb_playthrough` and `kb_training_worship` (published articles only), and
`worshipBoardState/youth`. Read only, and never `addressBook`.
YOUTH-ACCESS.md — which the rules referred to for a fortnight before it
existed — has the whole design.

---

## A-041 — the youth app read the worship team's pin board

`youthapp2.html` read **and wrote** `worshipBoardState/state`. `state` is the
worship team's board; there is a separate `youth` one, and the rules have given
it to Youth Worship all along.

Wrong twice over: it showed the youth the worship team's notes, and under the
locked rules it would have been refused anyway for an **adult** on Youth
Worship, who is not on the Worship Team. So the youth board has never worked
for the youth team, and the board they were looking at was somebody else's.

It reads and writes `youth` now. **Anything the youth app has already pinned
is on the worship board and will not follow** — it is in
`worshipBoardState/state`, where the worship team can see it. Worth saying
before anybody wonders where their notes went.

---

## A-042 — the youth app's Save failed silently, and had no catch

```js
const snap = await db.collection('services').where('date','==',date).get();
if (!snap.empty) await db.collection('services').doc(snap.docs[0].id).update(serviceData);
else await db.collection('services').add(serviceData);
alert('Youth service saved successfully.');
```

Writing a service plan needs `canAct('Youth Worship')`. A young person is not
an admin and never was, so the write was refused, the promise rejected, and the
line below it never ran: no alert, no error, no sign that anything had
happened at all. The plan looked saved and was not.

Now in words, and the words say what to do: *"Only a youth leader can save the
plan. Show them what you have put together and they will save it."* A leader
who hits a genuine failure gets a different sentence, about their connection.

---

## A-043 — the youth app put every adult's email address and telephone number on a child's phone

`youthapp2.html` read the **whole address book**, unconditionally, on every
load:

```js
const snap = await db.collection('addressBook').get();
snap.forEach(d => { const data = d.data(); if (data.email) addressBook.push(data); });
```

Every adult's name, email address, telephone number, address and household,
onto whatever phone had the page open. It was used for one thing: the
recipients of the "email the plan" button. The names on the plan itself come
from the rota table, not from here.

Against Martin's principle — *no email addresses for under-18s, ever* — in the
most direct way possible.

The read now happens only for a signed-in volunteer, and a young person
pressing the email button is told a leader sends it out. The rules refuse them
in any case, but a page that asks and is refused is a page that starts working
the day somebody widens a rule by mistake.

**Not done, and it is the better fix:** the recipients could be resolved
server-side, the way `whoAmI` resolves a member id, and then no page would
need the address book for this at all. That removes the last reason
`youthapp2.html` reads it and would let the read go entirely rather than being
gated. One function.

---

## A-044 — the most important assertion in the new check was measuring nothing

In the first run of `tests/check-youth-access.mjs`:

```js
const book = await ev('(window.addressBook || []).length');
ok('and the page never read the address book at all', Number(book) === 0, ...);
```

`addressBook` is a top-level `let` in a classic script. Those live in the
global **lexical** environment and are not properties of `window`, so this
read `undefined`, `(undefined || []).length` was `0`, and the assertion passed
whatever the page had done.

Two sibling assertions read `window.allSongs` and `window.eventsForDay` the
same way and **failed**, which is the only reason this was found. The one that
mattered failed safe into a pass.

This is A-033 again, in a check written after A-033, by the same hand, the same
afternoon. Writing the lesson down did not stop it: what stops it is a
deliberate break, and the break is what proved the rest.

**And the break found a second hole in the same assertion.** Putting the
address book read back made only *one* check fail: "NO ADULT EMAIL ADDRESS
anywhere on the page" still passed, because the page had every adult's address
**in memory** and had not drawn it yet. In memory on a child's phone is
precisely the thing being forbidden. All four privacy assertions now search
the page's own state as well as the DOM, and all four fail on that break.

---

## A-045 — a youth code can be read by anybody holding it, and it names the parent

`youthGrants/{code}` is `allow get: if true`, and the document holds `sentTo` —
**the parent's email address** — along with the child's name and member id.

The open read is not a mistake: `youth-access.html` looks the code up *before*
anybody is signed in, which is how redemption works at all. And 8 characters
from a 36-character alphabet is 2.8 trillion, so guessing is not the worry.
The worry is that a code in a forwarded email, or a used code, still hands over
a parent's address and a child's name to whoever has it.

Two ways to close it, neither done because neither is what was asked for:

1. Sign in anonymously first and make the rule `request.auth != null`. Cheap,
   and it leaves a disposable account behind on every mistyped code.
2. Redeem through a function, so the page never reads the grant. The proper
   fix, the same shape as `whoAmI`, and it would let `sentTo` stay out of
   anything a device can reach.

Also worth knowing: **the parent requirement lives in the page, not the
rules.** `youthGrants` create is `isAdmin()`, so an admin could write a grant
by hand for a young person with no parent on file. `sendCode()` refuses to, and
the panel only offers people flagged Under 16 who have a household — but the
rules do not enforce it.

---

## A-046 — two more pages the style check has never opened

A-032 said `index.html` is not in `tests/group1-screens.mjs`, so neither the
drawn pass nor the source pass has ever measured it. The same is true of
`youth-access.html`, which has `✓` as its success mark, and of
`youthapp2.html`, which has `📋 📌 🎸` on its home cards and `⚠️` in its alerts.

`youthapp2.html` is Step M's (Restyle Group 3), so that one is already
scheduled. `youth-access.html` and `index.html` are in no group at all, and
between them they are the only two pages a member of the church is ever
emailed a link to.

---

## A-047 — songSummaries had no rule at all, and three pages use it

Found while answering ChurchShow's question about whether anything still
writes it. It does:

| | |
|---|---|
| `SundayServicePlanner.html:552` | writes it |
| `youthserviceplanner.html:800` | writes it |
| `song-summary.html:148` | reads it |

There was **no `match /songSummaries/` block**, so the catch-all at the
bottom of the file refused all three. Every one would have stopped working
the day the rules were deployed, silently in two cases: both writers are
`await`ed without a catch.

Now `read: volunteer() || churchShow()`, `write: canAct('Worship Team') ||
canAct('Youth Worship')` — the same shape as `services`, which is what it
belongs with. Six checks, and it is in `check-access-levels.mjs` on both the
volunteers list and the device list, so it cannot drift back.

**Worth noting how it was found**: not by a check, and not by reading the
rules looking for holes. Another window asked a question about one collection
and the answer required opening the file. A collection with no rule is
invisible to a test suite that only tests the rules that exist.

---

## A-048 — the whoAmI move put a cold start in front of every page

The events window reported it (F-118): `addressbook.html` timed out after
"Shut the address book". It is mine, and it was worse than one page.

Moving the identity lookup into a function (A-036) left this in
`loadProfile`:

```js
if (d.linkedBy !== 'admin') {
  return findMembers(...).then(...)      // now an HTTPS call
}
```

`linkedBy` is `'auto'` for everybody matched automatically, which is almost
everybody — so **every page load in the suite waited on a function call**
before it would draw. And `fetch` has no timeout of its own, so where the
function was not listening the page waited for ever. The events window's
emulators (`firebase.events.json`) have **no functions emulator at all**, so
on their ports that was every page, every time.

Three changes:

1. **It is no longer awaited.** The re-check exists to notice that a *second*
   address book record has appeared on somebody's address — something an
   administrator does, weeks after the match. It has never needed to happen
   before the page draws, so it runs behind the page and what it finds applies
   from the next load.
2. **Once a session**, not once a page.
3. **`callFunction` gives up after eight seconds**, so a dead endpoint
   degrades instead of hanging. And a first sign-in that cannot reach `whoAmI`
   now shows "we do not recognise that address" rather than "something went
   wrong" with a fetch error on it.

The window this opens, stated: between an admin adding a second record on an
address and that person's next page load, they keep the identity they were
guessed into. That was already true for up to a page load.

`tests/check-pages-without-functions.mjs` is the gate. It **hangs** every call
to a hub function — not refuses it, because a refusal fails in milliseconds
and proves nothing — and then opens four pages.

---

## A-049 — "loaded" has to mean "a person can see it"

While proving A-048 I put F-118 back on purpose, and `addressbook.html`
**passed**.

Its rows were in the DOM: a page's own modular reads do not wait for
`egbc-guard.js`, so the list fills in underneath while the guard still has
`body{visibility:hidden}` and a "Checking access" splash on top. A person
would have sat looking at that splash for ever, and my readiness test —
counting `#memberListBody tr` — called it loaded.

Readiness now means the guard has finished and the body is visible, as well as
something having been drawn. With that, putting F-118 back fails five
assertions including the one named after it.

Third time in this session: A-033, A-044, and now this. Each was a check that
could not tell the two outcomes apart, and each was caught by the deliberate
break rather than by care.

---

## A-050 — ANSWER to the events window, F-125 A1 and A2

Read off `design/app-mockup.html`, which is the design Martin approved, not
from a plan. Line numbers are that file. **Nothing is built yet** — this is
the contract the shell will honour, so you are not blocked.

### A1a — how a screen sits in the shell

A screen is **a function that returns HTML**, registered under
`space + '_' + tab`:

```js
V.kids_today = function () { return '<div>…</div>'; };
```

The shell draws everything around it (mock-up line 407):

```
[ top bar: logo · title · bell ]      <- shell
[ spaces pills, if more than one ]    <- shell, only when the person has 2+
[ main.content  <- YOUR HTML ]
[ tab bar, one per tab in the space ] <- shell
[ sheet, if one is open ]             <- shell
[ toast, if one is showing ]          <- shell
```

So your screen owns the scrolling middle and nothing else. **No header of
your own, no bottom bar of your own, no `☰`.**

### A1b — what you get, and how you navigate

| | |
|---|---|
| `V[space + '_' + tab] = fn` | register a screen |
| `row(icon, title, sub, right, act, c, t)` | a list row (line 198) |
| `next(day, mon, title, sub, c, t, actions)` | the "next thing" card (line 201) |
| `sec(title, more, inner)` | a titled section with an optional link (line 204) |
| `ic(name, size)` | a Lucide icon |
| `esc(s)` | escape text — **use it on everything from the database** |

Navigation is **declarative, through `data-act` on a button** — never a
function call of your own, so the shell keeps the back behaviour and the
scroll reset in one place (line 419 onwards):

| `data-act` | What it does |
|---|---|
| `go:kids:today` | another space and tab. **Silently does nothing if the person is not in that space** — which is the behaviour you want |
| `tab:children` | another tab in this space |
| `sheet:checkin` | open a bottom sheet from `SHEETS` |
| `toast:Ada and Ben are checked in.` | a transient message |
| `close` | close the sheet |

Two things to design to:

- **Your screen is re-rendered from scratch on every navigation.** Keep state
  in the data or in a module variable, never in the DOM.
- **A screen must draw something for a person with nothing.** The shell falls
  back to the first tab if a screen is missing (line 398), and an empty screen
  with no words on it reads as a broken app.

### A1c — the bottom bar, the sizes and the safe areas

Already in the mock-up, and these are the numbers the shell will use. From
`APP-DESIGN-BRIEF` §7, and the reason is Martin tapping Groups and closing
the app instead:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
.tabs { display: grid; grid-template-columns: repeat(var(--n), 1fr);
        border-top: 1px solid var(--line); padding: 6px 4px 14px; }
.tab  { display: grid; justify-items: center; gap: 2px; font-size: 11.5px;
        font-weight: 500; padding: 6px 0; }

@media (max-width: 760px) {
  .tabs { padding-bottom: calc(26px + env(safe-area-inset-bottom, 0px)); }
  .tab  { padding: 10px 0; }
  .toast { bottom: calc(110px + env(safe-area-inset-bottom, 0px)); }
}
```

What that comes to on a phone: a 22px icon, a 2px gap and an 11.5px label
inside 10px of padding top and bottom is **about 58px per tab**, against the
48px §7 asks for. Below the tabs sits `26px + env(safe-area-inset-bottom)` —
26px on Android 3-button navigation, about 50px on gesture navigation, about
60px on an iPhone with a home indicator.

**Three things for anything you put near the bottom of a screen:**

1. Never position anything with a bare `bottom:` value. Use
   `calc(<your gap> + env(safe-area-inset-bottom, 0px))`, as `.toast` does.
2. A floating button or a sticky bar inside your screen must clear the tab
   bar as well — the tab bar is roughly 58px plus the safe area.
3. **Anything a finger lands on is at least 48px high.** A 36px hub button is
   fine on a desktop page and is not fine here.

### A1d — the one thing I would ask of your screens

**Never more than four tabs and nothing behind a `…`** (§2). If a Kids Church
screen needs a fifth thing, it goes in a sheet opened by a named button on the
screen, not in a menu. Tell me if that pushes against something and we will
work it out rather than quietly growing a menu.

### A2 — the spaces and tabs, confirmed

Exactly as you listed them, and they are in the mock-up already (lines
183–190):

| Space | Key | Tabs (keys in order) | Yours |
|---|---|---|---|
| Me and my family | `me` | `home` · `whatson` · `listen` · `me` | **`me_whatson`**, **`me_listen`** |
| Worship & AV | `worship` | `rota` · `sunday` · `learn` · `team` | — |
| Kids Church | `kids` | `today` · `children` · `rota` · `team` | **`kids_today`**, **`kids_children`** |
| Welcome | `welcome` | `rota` · `sunday` · `team` | — |
| Tea & Coffee | `coffee` | `rota` · `sunday` · `team` | — |
| Maintenance | `maint` | `jobs` · `rooms` · `team` | **`maint_jobs`**, **`maint_rooms`** |
| Running things | `office` | `today` · `people` · `bookings` · `send` | **`office_bookings`** |

So the seven screens to write are `me_whatson`, `me_listen`, `kids_today`,
`kids_children`, `maint_jobs`, `maint_rooms` and `office_bookings`. The space
and tab keys above are the contract; I will not rename them without telling
you.

**Two notes on that table:**

- **`office_bookings` opens Room bookings with "Approve?" from your
  `bookings` data** — agreed. The shell gives you the tab; the counting and
  the approving are yours.
- **Maintenance does not exist as a team yet.** That is your A3 and it is a
  real dependency: teams become data the office manages (§6), and until that
  is built there is no `'Maintenance'` for your rules to name. It is in my A1
  establishment, which is the next piece of work, and I will tell you the
  shape of the teams data before building anything that depends on it.

### The others, briefly, so you know where they stand

| | |
|---|---|
| **A3** — Maintenance, and teams as data | In my A1 establishment, starting next. The shape comes to you before anything is built on it. |
| **A4** — Home calls your helpers in `egbc-events-home.js` | Yes. Home is mine and the helpers are yours: give me `myFamilyThisSunday()`, `myEvents()` and `myGroupsNext()` returning plain data, not HTML, and I will draw them. |
| **A5** — the family rule | Agreed as you describe it: you join children to a family by the parent's sign-in email, and youth groups through the household are mine. The household model is `EGBCRotaPdf.householdIds` and there will not be a second one. |
| **A6** — `podcastFeed` in codebase `hub` | **Yes — Martin's choice.** Send me the spec (F-124) and I will build it in the hub codebase with the others. |
| **A7** — F-115 | **Done.** The clause is in; see below. |

---

## A-051 — F-115 done, and their own three checks cannot fail

The clause is in:

```
allow create: if signupShape() && takesItsPlaces()
              && canSignUpTo(request.resource.data.calEventId);
```

With it, **753/753** rules checks pass and the three sign-up checks run
instead of being skipped — including "SIGN-UP: AN ATTENDER CANNOT SIGN UP TO
A CHURCH-MEMBERS-ONLY EVENT".

**But taking the clause out again leaves the suite green: 750/750, measured.**
The three checks are written to skip when the clause is absent, with a note,
because they were written before it landed. That was right then and it is
wrong now — the guard that was waiting for the clause now hides its removal.

Their section is theirs, so rather than edit it I put the guard in the main
window's audit: `tests/check-access-levels.mjs` reads the rules file and fails
if `canSignUpTo(request.resource.data.calEventId)` is not on the sign-up
create. Proved by removing it: 65/66.

**For the events window:** worth turning the skip into a failure now, so your
own suite catches it too.

---

## A-052 — F-118, and the five other pages they listed

F-118 is fixed and is A-048 above. Their note also lists five pages that were
**already** timing out on their emulators before my change: MonitorStageMap,
Planner, SundayServicePlanner, view-only-rota and youthserviceplanner.

`tests/check-pages-without-functions.mjs` now opens all eight with every call
to a hub function **hung**, and all eight finish and become visible. So
whatever is slow about those five on their emulators, **it is not a missing
functions emulator** — their cause is something else and my change neither
caused nor cures it.

Their own guess, in F-118, is "it may simply be waiting for sign-in, as the
others do". That is worth checking from their side: a page served from
localhost:5601 talks to `firebase.events.json`'s emulators, and a page that
cannot sign in waits for `EGBCAuth.require()` for ever rather than failing.
`youthserviceplanner.html` in particular gained a sign-in door on 9 October
(the youth access work), so on their ports it now needs an account that
exists in **their** auth emulator.

---

## A-053 — Maintenance added as a team, and why §6 wants teams as data

The events window's A3. `'Maintenance'` is now a team, so its members can
mark a job done and their rules — which already say
`me().teams.hasAny(['Maintenance'])` — have something to match.

**This is not "teams as data" (APP-DESIGN-BRIEF §6).** That is a piece of A1
and means the office adding, renaming, recolouring and removing teams without
a Code window. This is one team, added the way the other eight are, so they
are not blocked waiting for A1.

And it is a decent argument for §6, because one team had to be written into
**four** files by hand:

| | |
|---|---|
| `egbc-auth.js` | `TEAMS` — the canonical list, with the label and the colour |
| `addressbook.html` | the team tick, **and** the "admin for" tick — two hand-written lists |
| `tests/test-account.mjs` | `ALL_TEAMS`, so the sweep account is on it |
| `egbc-menu.js` | the Menu entry, or the page is unreachable |
| `tests/check-menu.mjs` | the hand-written expectation, twice |

Whoever builds the data version should start from that list. The colour,
`#4f5a66`, is the one the approved mock-up uses for the Maintenance space, so
the hub and the app agree.

**No rota cap for Maintenance**, on purpose: a cap is "how often may this
person be put on the rota", and jobs are not a rota.

The Menu entry is top level with no team on it, because the page's own door is
"anyone signed in" — reporting something broken is for everybody, and only the
Maintenance team can mark it done.

---

## A-054 — the style check looks at 29 of 84 pages

The events window asked for `maintenance.html` to be in the sweep. It already
is: `smoke-all-pages.mjs` reads the directory. But `check-style-every-screen`
works from a hand-written list, and **a page missing from that list is not
reported as missing — it is simply never measured.**

That has now happened four times:

| | |
|---|---|
| A-032 | `index.html`, never style-checked, with emoji on its answer buttons |
| A-046 | `youth-access.html` and `youthapp2.html`, the same |
| — | `churchshow.html` would have been the fourth, had I not just written it |

So `tests/check-every-page-is-checked.mjs` is the gate: every `.html` in v2 is
either in the style check's list or on a NOT_YET list **with a reason**.
Adding a page and forgetting it fails. Deleting a page and leaving its name
behind fails. An excuse with no reason fails. All three proved by doing them.

**The number it printed on the first run is the finding: 29 of 84.** The other
55 are now written down with a reason each, grouped:

| Why | How many |
|---|---|
| the events window's own pages | 18 |
| Step M — Restyle Group 3, youth | 3 |
| **Step P — the rest of the restyle, not in a group yet** | **15** |
| the public availability form | 1 |
| instructions panels, opened from inside a tool | 4 |
| practice copies of tools | 5 |
| out of scope (Worship Hub, Calla Design, Mix Builder) | 5 |
| not pages anybody opens | 4 |

**Two of those 55 are worth Martin's eye.** `meeting.html` is one of
DESIGN.md's two named reference pages — "when in doubt, copy what they do" —
and it has never been style-checked. And `login.html`, the first screen
anybody sees, is in no group either.

**Six of my first guesses at that list were wrong**: pages I excused that the
style check already covers. The "no page is both checked and excused" check is
what said so, which is the only reason the list is right.

---

## A-055 — the parent requirement is in the rules now

Martin's first youth follow-up, after A-045 pointed out it was only the page's.

`youthGrants` create was `isAdmin()`. `hub-app.js` looks up the household
head, refuses to send without an address, and only offers people flagged
Under 16 — but an admin could write a grant by hand for a child with nobody
behind them, and nothing would have stopped it.

`grantHasParent()` asks about the **household**, not about a typed address:

```
the code is for a record that exists and is flagged Under 16
that record's household head is the record named as the parent
the parent's record exists and carries an email address
the address the code is being sent to is THAT address
```

So `issueCode` now records `parentId` as well as `sentTo` — without it the
rule has nothing to check the household against.

Eight checks, every one written **directly as a master admin**, which is the
only route the old rule left open. The deliberate break Martin named — taking
`grantHasParent` off the create — fails all eight.

`bookRec(id)` compares the `get()` to null rather than calling `exists()`
first, so the whole thing costs two document reads instead of four. That is
the A-037 lesson, which cost a passing check the first time round.

---

## A-056 — redeeming is a function, and closing the door found another one open

Martin's second follow-up. `youthGrants/{code}` was `allow get: if true`
because `youth-access.html` looked the code up before anybody was signed in —
and that document holds `sentTo`, **the parent's email address**. A forwarded
email, a screenshot or a used code handed it over.

`redeemYouthCode` does it now: checks the code, creates the identity, writes
`youthAccess/{uid}` and burns the grant **in one transaction**, and answers
with a custom token and the child's **first name only**. The collection is
shut to every page, and `youthAccess` create is `if false` — a phone writes
nothing.

Two things fell out of it.

**A phone could have burnt anybody's code.** The old rule let the redeemer
write `redeemedAt` and `uid`, and *a write needs no read* — so even with `get`
shut, a phone could have blind-written those two fields onto somebody else's
live code and destroyed it. Nothing reads it back, so nothing would have
noticed until a real code stopped working. Found because a rules check
expected the refusal and did not get it.

**No account for a wrong code.** The old order was sign in anonymously, then
look the code up, so every mistyped code left a disposable account behind.
The function creates the identity only on success.

### And a defect of mine, found by driving the page

`normalise()` strips the dash to tidy the input, and I then looked up
`youthGrants/<undashed>`. **The document ids are dashed** — `makeCode()`
stores `ABCD-2345` as the id — so every real code came back "we do not
recognise that code", and a nonsense one gave the same answer for the right
reason.

The rules tests could not see it: they never call the function. The function
check I would have written would have used whatever `normalise` produced and
agreed with itself. It took the browser walk, with a seeded code and a real
page, to say so — which is the fourth time in this session that the thing
which caught a fault was a check driving a page rather than a check of a
part.

---

## A-057 — what the two youth follow-ups leave

`YOUTH-ACCESS.md` has the full list; the short version:

| | |
|---|---|
| A six-week code on a lost phone works until it expires | revoking is immediate, noticing is not automatic |
| A refusal says which of three things went wrong | deliberate: "that one has been used, ask for another" is worth more to a fourteen-year-old than "no", against 36⁸ on single-use codes |
| The rules cannot check the email was actually sent | they check the grant names a parent with an address; delivery is between `sendEmail` and Resend |

**Both of the things that were on that list are off it**, and the record of
why is kept in the document, because they shaped the design.

---

## A-058 — R7: a fault at our end no longer reads as a bad code

The ChurchShow window's request, after testing against the real functions
(F-CS3). `churchShowRedeem` answered **every** failure with "That code isn't
valid or has run out" — including the one that will actually happen, which is
the IAM step not being granted. An operator would have made code after code,
each refused, with nothing anywhere saying the problem was ours.

Now: **500** with *"The hub couldn't finish connecting ChurchShow — ask the
hub admin to check the server setup (SERVER-DEPLOY.md)."* ChurchShow shows any
`error` sentence as it arrives, so no change was needed at their end.

Handled where it happens, inside `redeem()`, not in the function wrapper — so
it can be tested without one. **The emulator cannot produce this fault**: it
signs custom tokens locally and never asks IAM anything. The test hands
`redeem()` a signer that throws, which is exactly what a missing Token Creator
does, and the deliberate break (answering 400 with the bad-code sentence
again) fails all four assertions.

### And a dead limit they found while testing it

F-CS3 is right that my "five failed tries" check **could never have fired**:

- a wrong code hashes to a different document, so there is nothing to count it
  against
- `tries` was only ever incremented on a **successful** redemption, and a used
  code is refused by `usedAt` anyway

It was a check that read as protection and gave none. Removed, with what
actually protects it written down instead: the fifteen-minute life, 31⁸ (about
850 billion) and `maxInstances`. `MAX_TRIES` is gone; they import `hashCode`,
not that, so nothing of theirs breaks — but it is worth them knowing.

---

## A-059 — the pin boards: five of them, two moderated

Martin's third youth follow-up.

| Board | Who sees it | Who writes it |
|---|---|---|
| Worship (`state`) | Worship, AV, Choir | the same |
| **Kids Church** | **its admins only — narrowed** | the same |
| Youth (`youth`) | Youth Worship, and any young person with a live code | Youth Worship |
| **ReNu** (new) | ReNu adults, and ReNu children | ReNu adults |
| **Lazers** (new) | Lazers adults, and Lazers children | Lazers adults |

**Kids Church was narrowed, and that has a visible cost.** It already existed
and was open to anyone on the team; Martin asked for leaders only. A rules
check that had passed for weeks — "worship reads the kids board", where Samy
is on Worship *and* Kids Church — now reads *"a Kids Church MEMBER no longer
reads the kids board"*. That failing check is the whole of the cost, made
visible rather than argued about. **Say if you meant "as well as" rather than
"instead of".**

### Why a second collection and not a flag

A board is **one document holding every note** — `stickynotes.html` does
`BOARD_DOC.set({ pages, notes })`. To add a note you rewrite the whole board,
so letting a young person write it would let them rewrite or delete everybody
else's, and no rule can reliably tell "they appended one" from "they rewrote
the lot".

So a young person's post is its own document in `boardSuggestions`, readable
only by the group's adults. **"Waits for a leader before others see it" is
then true by construction** rather than by a flag somebody has to remember to
check: until a leader copies it onto the board, it is not on the board.
Approving is "put it up, then delete the suggestion", so there is no
half-approved state.

### No surnames, no contact details

The rules allow six keys and none of them is an email address or a telephone
number, and `firstName` must contain **no space** — which is what stops a
surname arriving. `redeemYouthCode` already stores `firstName` separately, so
that is what a post carries.

**What the rules cannot do is stop a child typing a number into the text.**
Nothing can, short of refusing free text. That is what the moderation is for,
and it is why the moderation is not optional.

### Which group a child is in

`redeemYouthCode` copies the youth groups off the child's address book record
when the code is redeemed. Reading the address book from the rules instead
would hand over every field of the record, because rules cannot pick fields
out of a document. If the office moves a child between groups, the next code
moves them.

### What is not built

**The box a child types a suggestion into.** `stickynotes.html` is guarded
"anyone signed in with a `users` document", and a youth-code account has none
— the guard turns them away before the page draws. Their surface is the ReNu
and Lazers spaces in the phone app, which is the next piece of work. The rules
and the leaders' queue are ready for it, and the rules tests exercise the
posting side already, so the queue is not untested — it is unused.

### Proved

33 rules checks across the five boards, 14 in a browser (a leader opening the
queue, putting one up, removing another), and six deliberate breaks: a child
writing the board, any child posting to any board, the queue readable by any
child, the queue listable by any child, approving without deleting, and the
queue reading every board at once.

**The last one was caught twice**, which is worth noting: the page asked for
*all* suggestions, and the **rules refused the query outright** — an
unconstrained list cannot prove `adminOf(boardGroup(...))`, so Firestore
refused the lot rather than leaking another group's. The page's filter and the
rule are both doing the job.

---

## A-060 — two regressions on the events window's pages, found by the style sweep

The full sweep went from **0 to 16** after their recent commits. Neither is
mine and I have not touched their pages.

| | |
|---|---|
| `places-admin.html`, sites tab | a button whose whole label is **"↑"** — an arrow glyph where a Lucide icon belongs. 2 faults, one per tab that shows it |
| `bookings-admin.html`, every tab | **`h2` at weight 700**, 14 times. DESIGN.md allows 700 on `h1` only |

**How the second one surfaced is worth knowing**: the offending text is "Page
Test Hall", which is a **site I seeded** in `tests/check-churchshow-page.mjs`.
The fault is theirs and is in the styling, not the data — any site name shows
it — but it took my synthetic site existing for a site heading to be drawn at
all. Worth saying so they can reproduce it.

The style check covering their pages is the system working. I am reporting
rather than fixing, because they are their pages.

---

## A-061 — App design A1 established: APP-A1.md

The whole of it is in `APP-A1.md`. Four things NEXT-BRIEF §22 asked for, plus
the events window's F-130 and F-131, which were blocking them.

**The number worth carrying away: of the mock-up's 24 screens, 11 open a page
that already exists, 8 are a phone layout over data that already exists, and
5 are genuinely new.** The app is mostly an arrangement, which is what
APP-DESIGN-BRIEF §5 intends.

### The one that changes a design decision

**The family rule cannot be computed on the phone.** `householdIds` follows
`householdId` links in **both directions over the whole address book** — the
book records households two ways, so one record is not enough. The address
book is now closed to Attenders (A-030), and "Your family this week" is a
section on an *Attender's* Home. So it needs a function.

The good news is that there is no new logic: `householdIds` is **already
exported server-side**, in `functions/rota-feed.js:75`, and already used by
the household calendar feed. `myFamily()` calls that and returns
`{ id, firstName }` plus dates — no surname, no telephone number, no address.
A-043 is why.

### Five things missing, and the one that is bigger than it looks

**A person cannot edit their own details.** `addressbook.html` is admins only,
so "My details" has nothing behind it. The whole point of the levels is that
an Attender has an account, and the first thing somebody wants is to correct
their own telephone number. It also needs a policy Martin has not given: the
mock-up's own words are *"Name, phone, address, who can see them"*.

The others: teams are not data; "message the team" has no route for a team
leader who is not Core Team; the leader's note on "This Sunday" has no field;
Giving has nothing at all; and `sermons-admin.html` exists but is reachable
from nowhere.

### Teams as data, and the decision that makes it cheap

**Key `teams/{teamId}` by the team's name as the rules already spell it** —
`Kids Church`, not `kids-church`. Then every `markers` array, every
`adminFor`, and **every string in `firestore.rules` keeps working untouched**.
`egbc-auth.js` reads the collection and keeps `TEAMS` as the fallback, so a
page that draws before the read lands still draws.

Two things deliberately excluded: **no rules generated from data** (a team
existing must never grant anything; `markers` stays the only switch, or adding
a team becomes a way of granting access), and **no rename in v1** — a real
rename rewrites every record that mentions the team, so archive-and-create is
the safe answer. That is a decision for Martin, because §6 does say "renames".

### F-130, answered accurately rather than dramatically

The mock-up's helpers do **not** make database text safe, and the live gap is
that `row()`, `sec()` and `next()` escape nothing at all — a song title with a
`<script>` tag in it would run. Every call passes a literal, which is the only
reason nothing shows.

`esc()` also misses `'`. **I first wrote that this was "one step from live"
and then checked: it is not.** Every attribute the mock-up builds is
double-quoted, so there is nowhere for a bare apostrophe to break out today.
Latent, worth fixing, not urgent — and saying so correctly matters more than
making the point sound sharper.

The shell's helpers will escape `title`/`sub` themselves so a screen cannot
forget, and `right`/`inner` stay HTML by design because they carry pills and
cards. A check will feed a name containing `<script>` and an apostrophe
through every helper.

### F-131, answered with a shape to agree now

`EGBCApp.refresh(space, tab)` — a no-op if the person has navigated away, so
a check-in arriving elsewhere does not yank them back. And a `watch` hook per
screen that returns its own teardown, because a screen is re-rendered from
scratch on every navigation and an `onSnapshot` started in a render function
would be started again each time and never stopped.

Their own click handlers are fine. The caveat worth stating is the one that
has caught me three times in my own checks (A-033, A-044, A-049): **the DOM is
rebuilt on every render**, so `getElementById('save').onclick = …` once at
load is lost. Delegate, or re-attach each render.

## A-062 — the shell is built, and the check that kept failing was the check

**Stage 1 of the app shell**: `egbc-app.js` (the spaces and tabs registry and
the display helpers), `app.html` (the shell page), and
`tests/check-app-shell.mjs` (36 assertions, five synthetic people, on a
phone-sized screen).

The shell worked early. The check took the rest of the day, and every hour of
it was one lesson repeated: **a wait that can fall through is a gate that
cannot fail.**

In order, what it did and what gave it away:

1. **A 7-second sleep.** One person passed, four reported "no spaces at all".
   The app was right and the check was early.
2. **A wait for `.tab` to exist.** Between a navigate and its commit the
   previous page's DOM is still on screen, so `.tab` was the last person's.
3. **A wait for `EGBCApp.who().name`.** It went green 31/31 - *because the
   `name` field had never been added to the people table, so the comparison
   was against `undefined`, never matched, and fell through to its full
   20-second sleep*. A pass for the wrong reason, which is this file's
   subject. Fixing the name dropped it to 29/31.
4. **A wait for `who().name` that worked.** Still wrong: the profile is live
   in the page before `draw()` has run with it.

What it waits for now is `#egbc-app`'s `data-drawn` attribute, which `draw()`
writes with the uid it drew for. **Only a render can produce it**, so it
cannot be answered by a stale page, by a profile that has arrived, or by
nothing at all. And a wait that times out now **fails and says where the page
was**, because "data-drawn: (none)" is equally true of an app that did not
draw and of a page that is not the app - and it turned out to be the second.

Three more gates of mine that could not fail, all found by that one change:

- **"gets in"** - `data-egbc-blocked` is empty on the sign-in harness too, so
  it passed on a page with no app on it. The check now asserts the page *is*
  `app.html` before measuring anything on it.
- **The sign-in was never checked.** Every other browser check in `tests/`
  asserts `currentUser` after signing in; this one navigated on the strength
  of an unchecked promise. Five fixed sleeps on the sign-in path are now five
  waits for a condition, including one for a working ID token.
- **Only `console.error` was collected**, so an uncaught exception - the
  loudest failure there is, and the one that leaves a promise pending for
  ever - was invisible. `Runtime.exceptionThrown` is collected now.

### The rules error in the emulator's log was my seeding

`firestore-debug.log` showed an evaluation error against `users/{uid}` on
every run, at the four `allow update` rules. It read like a launch blocker:
the mirror never updating means a person added to a team stays off it.

It was the check. `mirrorsBook` compares the mirror with the book field by
field, and the seeding put `churchMember` on the mirror and not in the book,
so every page load attempted an update the rules must refuse - and the app
swallows that failure (`.catch(function () {})`), so nothing said so. With
the book carrying `churchMember`, `archived` and `isMinor`, the run logs
**zero** evaluation errors and zero denials. **No rules change was needed, and
none was made.**

### Open, not fixed: A-064

One of the five, the Attender, still ends a run with no `lastSeen`, with no
denial in the log - so the write is not refused, it is not arriving. The
likely reason is a pending write lost when the check navigates away from the
first page it loads, before the connection is warm. That is a harness
artefact if so and nothing at all if not, and I have not established which,
so it is a number rather than a claim.

### Deliberate breaks

| Break | Caught by |
|---|---|
| `spacesFor` gives every space to everyone | 6 FAILs: all four "sees exactly", "no row of spaces at all", and "a space this person is NOT in is refused" |
| `draw()` never renders the spaces row (`mine.length > 99`) | 4 FAILs, **and no retry fired** - the reload below stayed out of the way |

### The one proof that matters

**Ten consecutive runs, 36/36, with the reload firing twice and saying so.**
Not one green run: ten. The flake this chased was 6 failures in 8 runs, and a
single pass would have proved nothing.

## A-063 — the app never recovers from a failed first profile read

Found while chasing A-062, in the app rather than the check, and **not fixed**
because it is `egbc-auth.js`, which every page shares and which the standing
constraints say to pull before touching.

The Firestore emulator intermittently leaves a new browser client unable to
open a stream. The page's first read then fails in one of two ways:

- **Loudly** - "Could not reach Cloud Firestore backend", then "client is
  offline", and `loadProfile`'s `.catch` shows **"Something went wrong"**.
- **Silently** - the read neither resolves nor rejects, so the guard's splash
  stays up **for ever**, with a quiet console and no way forward.

Either way **nothing in the page retries**, which the check proved from the
outside: a probe read issued from the same page a moment later *succeeded*
while the page stayed stuck, and a reload fixed it every time.

An emulator dropping a connection is a test-machine problem. **A phone on a
patchy signal is not.** This is the app's own front door, on every page in
v2, and what it does on a dropped first read is hang on a splash screen with
nothing said and nothing to press.

What it should do, for a later stage with its own deliberate break: retry the
profile read a few times, and if it still cannot, say so with a "Try again"
rather than an eternal splash. Rule Zero: no change may lock a user out -
and this locks a user out without any change at all.

The check does **not** paper over it. It reloads only on the exact
fingerprint of a dropped connection - splash still up, signed in, no profile
- and anything else fails at once, which deliberate break B above confirms.

## A-064 — the Attender's mirror write does not arrive (open)

See A-062. Not established, not fixed, and recorded so it is not rediscovered
from scratch.

## A-065 — the charter switch, and the pin board's

Martin, 10 October 2026, two instructions of the same shape: somebody who
belongs to two things should be able to see that, and move between them,
without going somewhere else first.

**The charter card keeps its own choice.** Somebody on Worship & AV and Youth
Worship has two charters, and reading the other one used to mean switching
team in the picker - which moves the rota, the panels, the notices and the
tools with it. The card now has a row of buttons, one per charter, and
pressing one redraws the card and nothing else. Picking a team in the picker
still moves the card, because that is the bigger act.

**One button per CHARTER, not per team.** Worship Team and AV Team share the
Worship & AV charter and Choir folds into Worship, so somebody on two of
those has one charter and gets no switch at all. Counting teams would have
given them two buttons that do the same thing, which is the first deliberate
break below.

**Found while building it, and it would have been mine:** `importCharter`,
`editCharter` and `saveCharter` all worked off `TEAM`. Once the card could
show another team's charter, Edit would have opened the shown charter and
**saved it into the picked team's document**. They follow `CHARTER_TEAM` now.

**The pin board says "Switch board" in words.** It was a bare `<select>`
carrying the current board's name, which reads as a title rather than a
control. It now has the words and an icon, and it only appears when there is
more than one board to go to. The Menu entry is "Pin boards" - plural, since
there are five - which also changed `tests/check-menu.mjs`'s approved list,
written out by hand so the check cannot agree with itself.

### Deliberate breaks

| Break | Caught by |
|---|---|
| count teams instead of charters | "Worship and AV share a charter, so still NO switch" |
| switching the charter also switches team | "THE TEAM DID NOT" |
| the control goes back to a bare title | "and it says what it does" |

The first of these failed to apply at first - a CRLF anchor - and the suite
came back 15/15, which I nearly reported as a break that passed. **A break
that did not apply is not a break**, and the only thing that caught it was
reading the applied-or-not line rather than the score.

`tests/check-charter-switch.mjs`, **15/15**.

## A-066 — two of Martin's five need the family rule, and are not built

Of the five things asked for on 10 October, three are done (A-065 and the
Menu rename). Two are **not**, and both for the same reason:

- a young person on the youth band **and** the main band seeing their
  main-rota dates and both charters in the Youth app
- offering a parent the boards for **their family's** youth groups

Both need to know who is in somebody's family. APP-A1.md established that
this cannot be worked out on the phone: `householdIds` needs the whole
address book, which is closed to Attenders since the privacy fix, and the
export already exists server-side at `functions/rota-feed.js:75`. That is
exactly `myFamily()`, the next piece of the app shell.

They are listed here rather than half-built, because a family rule computed
two ways is a privacy hole waiting for the two to disagree. **Martin's
deliberate break for them - a youth-only young person must not see the
Worship & AV charter - belongs with that work**, and is written down here so
it arrives with it.

## A-067 — the Menu check believed a comment

Adding `egbc-ui.js` to `youth-access.html` in Step M came with a comment
saying the page loads it directly "rather than through egbc-shell.js". The
Menu check decided which pages have a Menu by reading the whole file for the
string `egbc-shell.js`, so **the sentence about the file counted as a load of
it**: the check opened a Menu that was never there and reported the page as
having lost one.

It now looks for a script tag with that `src`, which across all 86 pages
changes exactly one verdict - this page - and leaves the other 62 as they
were. A mention is not a load, and the same shape will catch anyone who
writes about a file in a comment again.

## A-068 — safeguarding on the rota: the tick, and the gate behind it

NEXT-BRIEF §24, Martin, 10 October 2026. **Nobody goes on a ticked team's
rota slot without an in-date DBS check and safeguarding training**, or an
exception recorded with a reason.

**Creche is not a team.** Martin's list names it, but the address book holds
it as *roles inside Kids Church* - "Leader (Creche)" and "Assistant
(Creche)" - so ticking Kids Church already covers every creche worker.
Nothing was invented to match the list. The four ticked are Kids Church,
Youth Worship, Lazers and ReNu.

**"Cleared" is the events window's definition, reused rather than rewritten.**
`checksInDate()` from F-109: `dbsStatus` current, `dbsSeen` within
`dbsYears`, `trainingDate` within `trainingYears`. One definition for the
whole church, so the rota and the under-18s groups cannot drift apart about
who is cleared. The drift guard asserts that `rotaCleared()` still calls it.

### Two things about the rules that are not as they look, both proved first

I was about to design around a shadow field. Two emulator probes said
otherwise:

- `assignments.diff(before).affectedKeys()` **works on a nested map field**,
  and returns a **Set** - which **cannot be indexed**. `[0]` gives
  "Function not found error: Name: [[]]".
- Indexing a map by a **variable** key *does* work, and indexing a key that
  is **not there is an evaluation error** - so it fails closed rather than
  passing.

So the page names the slot it changed in `lastSlot`, and **cannot lie about
it**: `affectedKeys()` must be exactly that one slot. Filling a different
slot while naming an empty one is refused, and so is changing two at once.
There is no shadow list for the rule to trust, which is what the first
design would have had.

**Why one slot at a time.** A clearance costs about five document accesses,
and the limit is ten. An event arriving with a full rota would need one per
slot. F-109 solved the same problem the same way, checking the one leader
added rather than all of them; a new under-18s event must therefore start
empty, and is filled a slot at a time.

**A master admin is not exempt.** The exception route is - that is the point
of recording a reason. `rotaExceptions/<memberId>`, written only by a master
admin or the safeguarding lead, reason at least a sentence. Unlike F-109's
per-group exception this is church-wide, because a church rota is one thing
where a group is many; said out loud rather than left to be noticed.

### The tick is written down twice, and that is guarded

The tick lives in the teams data (`TEAMS` in `egbc-auth.js`) because that is
what the interface reads. The rules cannot read a JavaScript file, so the
four names are in `under18Teams()` as well. **Two copies of one truth is how
a gate stops covering a team** - tick one in `egbc-auth.js` alone and the
interface says a team is protected while the rules let anybody on its rota,
which is worse than no tick because it reads as safe.

`tests/check-under18-teams-agree.mjs` reads both files and fails naming
whichever team is missing from which. It holds the four names a **third**
time, copied from the brief by hand, because a check that only compared the
two files would pass just as happily when both lost a team.

It also found its own bug immediately: `split('\n')` on a CRLF file leaves a
trailing `\r`, and JavaScript's `.` does not match a carriage return, so a
pattern ending `(.*)$` failed on **every** line. The check reported no ticked
teams at all - which reads exactly like the tick being missing. Fifth time
line endings have cost me this session.

### Deliberate breaks

| Break | Caught by |
|---|---|
| untick Lazers in the teams data only | "every team the brief names is ticked in the teams data", naming Lazers |
| drop Lazers from `under18Teams()` only | "every team the brief names is enforced by the rules", naming Lazers |
| remove `safeguardingOk()` from the events write rule | **six** rules tests, including Martin's named one |

`firestore-rules.test.mjs` **909/909** with 16 new checks; with the gate
removed, **903/909**.

### Still to build

The planner side: Planner.html and the Core Team rota saving one slot at a
time for a ticked team, saying **why** somebody cannot be added, and
offering "Record an exception" to a master admin or the safeguarding lead.
The rules refuse an uncleared person today, so the rota is safe; what is
missing is the explanation, and until it is built a planner sees a refusal
rather than a reason.

## A-069 — teams as data, and who runs things (NEXT-BRIEF §25)

Two pieces, because the second needs the first.

### Teams as data (APP-A1 §4, steps 1 and 2)

A `teams/{teamId}` collection where **the id is the team's name as the rules
already spell it**. That one decision is what makes it cheap: every
`markers` array, every `adminFor`, and every team name written into a rule
keeps working untouched, and **the rules do not read the collection at
all** - a team appearing there grants nothing by itself, or adding a team
would be a way of granting access.

`egbc-auth.js` reads it once per page, cached, alongside the profile rather
than after it, with the built-in `TEAMS` table as the **fallback**: a page
that loads before the read lands, or with no connection, still draws its own
team's colour. The read never rejects.

**The address book's two tick lists are generated from it now.** There were
two written out by hand, and they had already drifted - Core Team was first
in one and last in the other. A team the office adds has to appear in both,
or somebody can be made an admin of a team nobody can be put on.

**A team id has a space in it**, which Firestore is content with and a URL
is not: the first seeding call threw `ERR_UNESCAPED_CHARACTERS` outright.
The compat SDK encodes for itself, so only the test harnesses had to learn.

### Who sees Running things

`spacesFor()` gave the whole space to anyone who administered anything, or
was on Core Team. **Wrong both ways**, and both are now checked: the church
administrator may not be on Core Team, and a Worship admin should not get
People and Send for looking after Worship.

A **group is a team with `rota: false`** carrying `runs`. Church office has
all four tabs, Bookings has one. People are put in a group exactly as they
are put on a team - Martin's "we do need to be able to set groups though so
we dont have to individual tick 130 profiles" - so changing the group
changes everybody in it at once, which is the sixth test.

**One helper, `EGBCAuth.runsTabs()`**, used by the app's Running things and
by the computer's Menu, so a person cannot be offered the address book on
one and refused it on the other. The Menu's Address Book and Email Compiler
were `core: true` and are `runs: 'people'` / `runs: 'send'` now.

### Two layers, and they are not the same question

- **allowed** - what the groups and ticks permit (`runsTabs`)
- **shown** - what the tab bar offers, which also needs a screen to exist

§25 says "a visible tab must actually open for that person". **Today is
allowed by the Church office group and has no screen behind it**, so it is
allowed and not shown. That is the rule working, and the check says it out
loud rather than leaving a count to imply it - asserting only what is shown
would hide a group losing a tab, and asserting only what is allowed would
promise a tab that opens nothing.

### A guard I described wrongly, and the break that proved it

`runsTabs()` starts `if (isMaster() && !v)`. I wrote that the `!v` is what
makes view-as work. **It is not**: `isMaster()` already returns false while
viewing as somebody else, so removing `!v` changed no test at all. The thing
that does the work is one line further down, and breaking *that* is caught
immediately. The comment says so now.

### Deliberate breaks

| Break | Caught by |
|---|---|
| the old "an admin of anything, or Core Team" rule | eight assertions: both the people who should not have it, and all three who should |
| `runsTabs` ignores view-as (the `!v` guard) | **nothing** - see above; the guard was belt and braces |
| `runsTabs` reads own teams instead of the viewed team | "LOOKING AS THE BOOKINGS GROUP, they see its one tab" |

`tests/check-runs-tabs.mjs`, **30/30**, covering every case on Martin's §25
list. `tests/check-app-shell.mjs` **48/48**, where the Core Team person's
expectation changed from "sees Running things" to "does not" - which is the
correction, kept visible rather than deleted.

### For Martin, before this goes live

**The Church office group has to exist, with people in it.** Until it does,
the office loses the Address Book and Email Compiler from the Menu, because
Core Team no longer carries them. A master admin still sees everything, so
nobody is locked out of fixing it.

### A-069, continued: the rules, and what the Menu check had to learn

**The `teams` rule**: read by anyone active, written only by a master admin,
with the id required to equal the name (or two spellings would mean one
group) and `runs` allowed only the four tabs that exist. `runs` is mirrored
onto `users/{uid}` the same checked way `teams` is, so **nobody can give
themselves a tab** - the break that stops checking it fails exactly the two
assertions that say so. `firestore-rules.test.mjs` **953/953**.

One of those tests was wrong twice before it was right, both times refusing
for a reason that had nothing to do with `runs`:

- `as('isla')` carries **no email claim**, so `bookIsMine()` was false and
  the write was refused whatever `runs` said. A gate that says no because
  the set-up is wrong proves nothing about the gate.
- With a verified email it still failed: Isla's fixture has
  `attender: false` while her address book record would make her one, so
  `mirrorsBook()` refuses her heartbeat outright. The test now uses a person
  whose mirror and record agree.

**The Menu check needed two corrections of its own**, both found by running
it rather than by reasoning:

- "People and email" is a heading with no page of its own, so `prune()`
  drops it when both its children are hidden. A Core Team member sees no
  empty heading where the address book used to be - so the heading belongs
  with its children in the office list, not in the Core Team one.
- The church administrator reaches those children **through** the "Core
  Team" heading, exactly as a bookings admin reaches Room bookings, and must
  not thereby be handed the Core Team charter. That is `OPENED_FOR_OFFICE`,
  the same mechanism as `OPENED_FOR_BOOKINGS`.
