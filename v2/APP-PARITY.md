# The four phone apps, screen by screen, and where each one lands

APP-DESIGN-BRIEF §7b, after Martin: *"why isnt there a core team area in the
phone app? They will be doing the sunday service plans from the phone app.
Look at the current core team phone app!"*

**He is right, and I made the gap worse.** Asked about a Core Team space a
few hours earlier I said there was none and that nothing extra was needed —
I had read the shell's own table of spaces and reported what it said,
without opening `CoreTeamApp.html` to see what Core Team actually do on a
phone. The table below exists so that cannot happen again for the other
three.

**The old apps stay installed and working.** Nothing here retires one, and
no manifest `id`, `start_url` or `scope` changes. This is about what the new
app must be able to do before switch-over, not about taking anything away.

**How to read the "Where it lands" column.**

| Mark | Means |
|---|---|
| **built** | it is in the new app now and works |
| **planned** | a named stage owns it, and it is not built yet |
| **GAP** | nothing owns it. A launch blocker under NEXT-BRIEF §15 |

---

## 1. CoreTeamApp.html — the Core Team's phone app

3,557 lines. Five sections (`openSection`): Service Planner, Rota Planner,
Meetings, Email Compiler, plus the home tiles. Twelve sheets and modals.
**This is the one the new app had no answer for at all.**

| Screen or action | What it does | Where it lands |
|---|---|---|
| Home tiles | Service Planner, Rota Planner, Meetings, Email Compiler | **planned** — Core Team space, the four tabs below |
| **Service Planner** list (`renderServiceList`, `loadServiceList`) | every service, newest first; archived ones folded away | **planned** — Core Team ▸ Plan |
| **Service detail** (`openServiceDetail`, `renderServiceDetail`) | one service: its order, songs, team | **planned** — Core Team ▸ Plan |
| **The order of service** (`renderOrderList`, `spAddItem`, `editOrderItem`, `deleteOrderItem`, drag to reorder, `spUpdateNumbers`) | build and reorder the running order | **planned** — Core Team ▸ Plan, **moved not rewritten** (§7b) |
| **Songs** (`spAddSong`, `spSearch`, `spSelectSong`, `onSongTitleInput`, `selectSongFromSearch`) | search the library, add a song to the order | **planned** — Core Team ▸ Plan |
| **Key and key info** (`spKeyChanged`, `spShowKeyInfo`, `toggleSongKey`, `loadSongInfoPanel`) | choose the key, see what is in the library for it | **planned** — Core Team ▸ Plan |
| **YouTube and SongSelect buttons** | open the song elsewhere | **planned** — Core Team ▸ Plan. Named in §7b as not to be lost; the same two links the Youth planner has |
| **Notes on an item** (`saveOrderItem`, `editSongItem`, `spAutoFit`) | free text against each item | **planned** — Core Team ▸ Plan |
| **Default order** (`spSetupDefaultOrder`) | a new service starts with the usual shape | **planned** — Core Team ▸ Plan |
| **Save / new service** (`spSave`, `saveService`, `createService`, `openNewServiceModal`, `saveServiceMeta`, `openEditServiceMeta`) | make and save a service | **planned** — Core Team ▸ Plan |
| **Archive a service** (`archiveService`) | put an old one away | **planned** — Core Team ▸ Plan |
| **Email the plan** (`spEmail`, `buildServicePlanText`) | send the order to the team | **planned** — Core Team ▸ Plan |
| **Rota Planner** (`renderPlanner`, `spLoadRota`, `renderServiceRotaTable`, `spSortAssignments`) | assign the team to services | **planned** — Core Team ▸ Rota |
| **+ a new event** (`modal-new-event`, `loadEventTypesForDate`) | add a service or event to the rota | **planned** — Core Team ▸ Rota |
| **Who is available** (`modal-avail-sheet`, `setAvailability`, `availLabel`, `candidatesFor`) | who can serve on a date | **planned** — Core Team ▸ Rota |
| **Role sheets** (`modal-role-sheet`, `modal-add-role-sheet`, `setRoleNote`) | assign and note a role | **planned** — Core Team ▸ Rota |
| **Who are you** (`modal-who`, `saveWho`) | the planner says who is editing | **planned** — Core Team ▸ Rota |
| **Meetings** (`renderMeetings`) | upcoming online meetings, join a call | **planned** — Core Team ▸ Meetings |
| **Email Compiler** (`compileEmail`, `clearEditor`, `insertSideLayout`, `uploadEmailImage`, `resizeImg`, `applyColor`, `applySize`, `generateEventHtml`) | write and send a formatted email | **planned** — Core Team ▸ Team, opens `EmailBuilder2.html` |
| **Drafts** (`openDraftsSheet`, `saveNewDraft`, `loadDraft`, `overwriteDraft`, `deleteDraft`, `updateDraftBar`) | keep and reuse a draft | **planned** — with the Email Compiler |
| **Mailing list** (`openMailingSheet`, `toggleMailTeam`, `updateRecipientCount`) | choose who it goes to | **planned** — with the Email Compiler |
| **Email one person / whole team** (`emailOnePerson`, `emailTeam`, `emailWholeTeam`, `launchEmail`) | a quick message | **planned** — Core Team ▸ Rota and ▸ Team |
| **The welcome tour** (`startTour`, `showTourStep`, `nextTourStep`, `endTour`, `maybeTriggerTour`) | shows a new person round | **GAP** — see below |

## 2. worshiphubapp.html — Worship & AV

3,357 lines, seven sections. **Out of scope everywhere** (NEXT-BRIEF §4):
not restyled, not touched, not retired. Listed because §7b asks for it, and
because the new app's Worship & AV space has to carry the same work.

| Screen | Where it lands |
|---|---|
| Worship resources — Play-Through tab | **built** — Worship ▸ Learn opens `EGBC-PlayThrough.html` |
| Worship resources — Training tab | **built** — Worship ▸ Learn |
| AV — How-To tab | **built** — Worship ▸ Learn opens `EGBC-HowTo-AV.html` |
| AV — Troubleshoot tab | **built** — Worship ▸ Learn opens `EGBC-Troubleshoot-AV.html` |
| Rota | **built** — Worship ▸ Rota |
| Pin board | **built** — Worship ▸ Team, the Worship board |
| Song library | **built** — Worship ▸ Sunday opens `Library.html` |
| Music upload | **built** — Worship ▸ Sunday opens `music-uploader.html` |
| News | **planned** — Home, with the notices |

## 3. youthapp2.html — the youth app

2,450 lines, seven sections. Stays as the young people's own app (they sign
in with a code, not an account), and the new app's Youth space must do the
same work for the adults.

| Screen | Where it lands |
|---|---|
| Home tiles | **built** — Youth space |
| Youth Service Planner | **built** — Youth ▸ Sunday opens `youthserviceplanner.html` |
| Idea pin board | **built** — Youth ▸ Team, and the queue on `stickynotes.html` |
| Worship resources (Play-Through, Training) | **built** — Youth ▸ Rota/Team rows |
| Music uploader | **built** — opens `music-uploader.html` |
| Song library | **built** — opens `Library.html` |
| News | **planned** — Home, with the notices |
| **Suggest an idea** (new, 10 Oct) | **built** — the youth board's queue |

## 4. Performancenotes.html — the musician's stand

1,660 lines. One screen with a PDF viewer, used while playing.

| Screen or action | What it does | Where it lands |
|---|---|---|
| Start screen (`dateInput`, `serviceSelect`, `roleSelect`) | pick the date, the service and your instrument | **GAP** |
| Song screen (`showSong`, `songContent`, `pdfViewer`, `songCounter`) | the chart for the current song, full screen | **GAP** |
| Previous / next song (`prevBtn`, `nextBtn`, `prefetchNext`, `prefetchFile`) | move through the set without leaving the stand | **GAP** |
| Your notes (`notes`, `saveBtn`, `storeLevels`, `loadStoredLevels`) | what you wrote for this song | **GAP** |
| Instrument notes (`instNotesText`, `channelsForRole`) | notes for your instrument | **GAP** |
| Last time (`lastNotesText`, `getLastTime`, `fetchLastTime`) | what was noted when this was last played | **GAP** |
| Play-throughs (`getPlaythroughs`) | the recording for this song | **built** — Worship ▸ Learn has the library |
| **Monitor setup** (`loadMonitorSetup`, `mmConnect`, `mmRequestScan`, `mmSend`, `applyScan`, `renderMonitorBody`) | talks to the monitor desk over the network | **GAP** — and see below |

---

## The gaps, and what I would do about each

### G-1 — Performance Notes has no home at all (the big one)

Seven of its eight screens are gaps. It is the app a musician holds **while
playing**: the chart, the next song, the notes. Nothing in the new app does
it, and nothing is planned to.

**It may not need one.** It is an installed app that keeps working, it is
used in one place for one purpose, and a tab in a general church app is not
obviously better than the thing they already open. **Monitor setup in
particular talks to hardware on the church network** and does not belong in
a phone app people use on the bus.

**This is Martin's call, and it is the one question in this table I cannot
answer from the code.** Three ways:
- **(a)** leave it as its own installed app, and put a row in Worship ▸
  Sunday that opens it. Cheapest, loses nothing, and is honest about what it
  is for.
- **(b)** bring the chart, next/previous and notes into Worship ▸ Sunday and
  leave Monitor setup in the old app.
- **(c)** bring all of it across, Monitor setup included.

I would do **(a)**, and say so rather than quietly leaving a GAP in a table.

### G-2 — the welcome tour

CoreTeamApp and youthapp2 both show a new person round on first open. The
new app has nothing like it. Small, and worth one row in a later stage
rather than a launch blocker — the app is simpler than either of them.

### G-3 — News, in two apps

Both list notices. The shell's Home is planned to carry them, so this is
only a gap if Home ships without them. Named here so it cannot be forgotten
when Home is built.

---

## What I propose to build next, and what I have NOT built

**Not built, on purpose: the Core Team space.** §7b says to stop after this
table, and I have. The shape it describes is clear and I would build it
exactly as written — Plan, Rota, Meetings, Team, with CoreTeamApp's own
phone planner **moved or shared, not rewritten**.

**One thing worth settling first**, because it decides how the work is done
rather than what it does: CoreTeamApp's planner is ~900 lines of `sp*`
functions inside a 3,557-line page, reaching page-level globals and DOM ids.
Moving it means lifting it into a shared file both the old app and the new
space load, so there is one copy and the old app keeps working. That is the
right shape and it is not a small job. The alternative — copying it — gives
two planners that drift, which NEXT-BRIEF §15 and my own A-053 both warn
about.

---

## Two rows owed, recorded so they are not lost

**Core Team ▸ Team gets the Core Team pin board** (Martin, 10 Oct 2026),
opening `stickynotes.html?board=core`, beside the Email Compiler, the Core
Team charter and resources. **Not built**, because the Core Team space
itself is not — §7b says to stop after this table. It goes in with the
space, and `check-app-shell.mjs` already holds the gate that will catch it
if it is missed: every team space must offer its own board, checked by
board id rather than by "a row exists", as a person on every team.

That gate exists because **Kids Church had no such row at all**, a leftover
from the board being leaders-only, so the people the board is for had no way
to it from the app. It is there now.

## Notices on Home: confirmed, and the field is `until`

Martin asked whether Home's notices will show the latest news **with its
show-until date** (§17). Yes, and the mechanism already exists on the hub
rather than being something to invent:

- the hub's notice editor has **"Show until (optional)"** (`nwUntil`,
  `hub.html`), stored as `until` on the news document
- `isNewsExpired(n)` in `hub-app.js` is `n.until && n.until < todayIso()`,
  so a notice takes itself off the page the day after
- `forMe(n)` filters by team on top of that

Home in Stage 2 uses the same two functions rather than a second copy, so a
notice that has expired on the computer cannot still be showing on the
phone. Checked in the code just now, not remembered.

---

# Part 2 — the 25 pages the app opens, at 375px (§7d A2)

Martin: *"it isnt even phone width. It is the desktop version of the website
in places."*

`tests/check-app-opens-phone-width.mjs` opens every `open:` target the app
has — read out of `app.html` and `egbc-app.js`, so a row added tomorrow is
measured tomorrow — on a 375px phone profile, signed in with access to
everything so each page draws itself rather than a refusal. Pictures in
`screenshots/app-width/`.

## What the measurement is worth, and what it is not

It took three passes to produce a number I would put in front of anybody,
and the first two were wrong in ways that read as good news:

- **"0 of 25 draw the website bar or Menu."** The detector looked for
  `.egbc-bar` and `#egbcBar`. The element is `#egbc-bar`. **22 of 25 draw
  it** — everything except `hub.html`, `index.html` and `login.html`. A
  detector that finds nothing looks exactly like a clean result.
- **"24 of 25 fit."** True, and misleading: "fits" only meant the page does
  not scroll sideways. `addressbook.html` passes that and shows
  `adult.leader.secret@exampl` — an email cut off mid-word — and a
  household menu reading `None / Ne`. Content clipped **inside** a
  container is invisible to a page-level width check.
- **The clipped-content check then reported the website bar's own page
  title** (`Play-Through…`, `Address Book…`) as a fault. That ellipsis is
  deliberate chrome, which app mode removes anyway. Excluded now.

**I only caught the first two by opening the screenshots instead of
believing my own output.** The measurement sorts the obvious cases; part C —
you looking at the pictures — is what actually decides.

## 1. Phone-ready: keep them, in app mode

No sideways scroll, no desktop layout, nothing clipped. They need **app mode
and nothing else**: the website bar off, the app's header and tab bar on.

`EGBC-HowTo-AV.html` · `EGBC-PlayThrough.html` · `EGBC-Training-Worship.html` ·
`EGBC-Troubleshoot-AV.html` · `Library.html` · `Worshipteamcharter.html` ·
`Youthcharter.html` · `index.html` · `login.html` · `meeting.html` ·
`resources.html` · `stickynotes.html` · `view-only-rota.html` ·
`worried.html`

`view-only-rota.html` is worth naming: I opened it as a control expecting
trouble and it is genuinely good on a phone. The answer really is mixed
rather than uniformly bad.

### The events window's, and theirs to fix

These eight are the events window's pages. All measure as phone-ready today,
so they need app mode and no more — but they should see this list and judge
their own by eye:

`whatson.html` · `safeguarding.html` · `rooms.html` · `maintenance.html` ·
`kids-checkin.html` · `kids-admin.html` · `bookings-admin.html` ·
`groups.html`

## 2. Has a phone version already — use that, shared not copied

| Page the app opens today | The phone version that exists | Where it should go |
|---|---|---|
| `EmailBuilder2.html` | CoreTeamApp's **Email Compiler** section, with its drafts and mailing-list sheets | Core Team ▸ Team |
| *(the desktop rota planner)* | CoreTeamApp's **Rota Planner** | Core Team ▸ Rota |
| *(SundayServicePlanner)* | CoreTeamApp's **Service Planner** (`spInit`) | Core Team ▸ Plan |

§7b already says these are moved or shared, never rewritten and never
copied. **This is the same work**, which is why both halves are in one file.

## 3. Desktop only — do not open from the app

### `EmailBuilder2.html` — the one hard failure

**+321px of sideways scroll at 375px**, and the picture is worse than the
number: the formatting toolbar is cut off at the right, the email preview is
wider than the screen, the "Send to" panel is clipped, and the reply-to box
runs off the edge. `div#whoModal` alone is **696px** in a 375px window.

It is category 2 as well as 3: CoreTeamApp already has a phone email
compiler. **The app should open that, not this.** Until Core Team ▸ Team
exists, the row should say "easier on a computer" rather than drop somebody
here.

### `hub.html` — not a width problem, a rule

It measures as fitting, and §7d says plainly: **never open hub.html from the
app.** It is the website's home. Notices belong on the app's Home, and
"Open the full website" on Me is the only route there, saying so. The app
currently has a row that opens it; that row goes when Home is built.

### `addressbook.html` — fits, and should not be opened as it is

No sideways scroll, but a **560px table in a 375px window**, so emails are
clipped mid-word. A phone user wants to look somebody up and ring them, not
edit the address book. **A native "find a person" screen** is the honest
answer; the full page stays on the computer.

## The check, and what it fails on

`check-app-opens-phone-width.mjs` fails the build when any `open:` target
scrolls sideways at 375px, which §7d A2 asks for. It is **failing now**, on
`EmailBuilder2.html`, and will keep failing until that row stops pointing
there — which is the point of a gate rather than a list.

It also reports, without failing: which pages draw the website bar (22), the
widest table on each, and any content clipped inside its box. Those are
signs for the eye, not verdicts.

## The off-screen-text measurement, and three goes at getting it right

I wrote this detector **three times** and each wrong version returned
"none" or "0" — which is indistinguishable from good news.

1. It looked for `.egbc-bar`, an id that does not exist, and reported that
   no page draws the website bar. Every one of them does.
2. It compared each element's `scrollWidth` with its own `clientWidth` and
   found nothing. The address book's emails are not clipped by their own
   box: they sit in a 560px table that an ancestor clips, so each element
   is simply positioned off the screen.
3. It then caught only the website bar's page title — `Play-Through…`,
   `Address Book…` — which is deliberate chrome that app mode removes.

It now measures what a person actually sees: text whose right edge is past
the right edge of the screen. **The only reason a clean bill of health
never reached Martin is that I opened the screenshots instead of believing
my own output.** When a measurement disagrees with a picture, the picture
wins.

What it finds now:

| Page | Off the right edge |
|---|---|
| `EmailBuilder2.html` | "Your name is saved alongside…", "Hi team,…", "Start your update here…", the footer verse, `worship@esherchurch.org` |
| `addressbook.html` | "Family…", "Instruments…" — the 560px table's headings |
| `stickynotes.html` | "No notes yet — add the first…" |
| `hub.html`, `login.html` | "Nothing new…" |

**The last two rows are probably not faults, and I have not proved either
way.** A pin board is a canvas you drag, so a note to the right of the
screen is the point of it; and "Nothing new" on the hub and the sign-in page
is likely an element parked off-screen on purpose. They are listed because
hiding a result I cannot explain is how the first three versions of this
check happened. **The first two rows are real**, and both pages are already
in list 3 for other reasons.

This is a **sign, not a gate**: the build fails only on sideways scroll,
where the measurement is unambiguous.
