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
