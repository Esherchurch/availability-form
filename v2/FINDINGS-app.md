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
