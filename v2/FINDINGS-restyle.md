# Findings — restyling the v2 pages

Numbered for the Code windows. Every claim about existing code was made after
opening the file named.

Group 1 opened 2026-10-06. Step A (finishing Group 1) 2026-10-06.

---

## R-009 — five pages never connect to the emulator, and I wrote to live data

**Read this before driving any of those pages locally.**

`egbc-auth.js` connects to the emulators when the page is served from
localhost, so "serve it from localhost" has meant "it is talking to the
emulator". That is only true of pages that use `EGBCAuth.db`.

These five call `initializeApp()` for themselves and never connect anything:

| Page | Firestore it talks to |
|---|---|
| `addressbook.html` | **live** |
| `Planner.html` | **live** |
| `SundayServicePlanner.html` | **live** |
| `CoreTeamApp.html` | **live** |
| `view-only-rota.html` | **live** (reads only) |
| `resources.html`, `videos.html` | emulator, via `EGBCAuth.db` |

I assumed localhost meant the emulator, drove the save buttons for the R-006
proof, and **five records went into the live database**: four people in
`addressBook` (two "Diag Person", two "Zed Synthetic …", all on
`@example.invalid` addresses) and one empty `services` document with no date
and no leader. Nothing real was changed or deleted; these are five things that
did not exist before, all written between 15:45 and 15:51 on 6 Oct 2026.

A script that removes exactly those five by document id, printing each one
first and refusing any address book record whose email is not
`@example.invalid`, is in `Downloads/remove-my-test-records.js`.

**What this means for the briefs.** "Synthetic data only, test against the
emulator" is currently impossible for those five pages, and anyone who tries
will do what I did. The fix is the same three lines `egbc-auth.js` already has,
in each page's own init — or better, have them use `EGBCAuth.db` like
`resources.html` and `videos.html` do, which is one connection instead of six.
That is a behaviour change, so it is recorded here rather than done inside a
restyle: `RESTYLE-BRIEF.md` says look only, stop and record.

**Until it is fixed, do not click save on those five pages on localhost.**

---

## Step A — done

### R-001 — the theming engine now lives in `egbc-ui.js`
Moved out of `egbc-shell.js` unchanged, with one change to how it is switched
off: `data-theme="off"` is read from this script's own tag **or** from the
`egbc-shell.js` tag, because when the shell loads `egbc-ui.js` itself,
`document.currentScript` is a tag the shell generated and carries no
attributes. `contenteditable` is still skipped. No copy was left behind in the
shell.

`egbc-ui.js` is now loaded directly by the four in-scope pages that have no
bar: `CoreTeamApp.html`, `youthapp2.html`, `index.html`, `login.html`.

Checked on all ten pages, with the bar and without: the engine ran, the body
computes to Inter, no element is left in Montserrat, and no element is left
uppercase — 39 of 40 checks, the one failure being R-010 below, which is older
than this change.

### R-002 — emoji replaced in Group 1
`CoreTeamApp.html` home tiles: calendar-days, users, video, mail, each in a
36px tinted badge rather than a 28px character. `resources.html` empty state:
folder-open. The one in the meetings list went earlier.

Emoji inside people's own content were left alone.

### R-003 — team colours are dots now
`resources.html` drew the selected team tab as a solid fill in that team's
colour. It is now the brand's selected style — tint background, ink text — with
the team colour as an 8px dot beside the name, per `DESIGN.md`.

### R-004 — "View the site as" is sentence case
It is in `egbc-auth.js`, not the shell: my Group 1 report said the shell and
that was wrong. The text was already sentence case in the source; the capitals
came from `text-transform` on the span. Now Inter, 13px, weight 500, 8px radii,
`DESIGN.md` colours. Nothing about how viewing-as works was touched.

### R-005 — the phone apps no longer scroll sideways
Measured rather than guessed. `Planner.html` was 476px wide inside 375px: the
row already wrapped, but the strip of six team checkboxes inside it did not —
a 418px line. It wraps now. `SundayServicePlanner.html` was 598px because
`#serviceTypeNotes` was a flex child that could not shrink; `min-width:0` at
≤640px is what lets `flex-1` mean what it says.

Both now measure a scroll width of exactly 375 with no element past the edge.

---

## Still outstanding in Group 1

### R-006 — cards and lists are not rebuilt to the card spec
`DESIGN.md` describes a card as a 32px tinted icon badge, a title, actions
right and a divider below; a list row as a 34–36px icon box with a name and one
muted line. That is per-page markup and has not been written. The answer in
`NEXT-BRIEF.md` puts it in Group 1, so Group 1 is not finished.

### R-007 — the main-action proof is done for two pages of seven
`resources.html` and `videos.html` use `EGBCAuth.db`, so they can be driven
against the emulator, and adding a video end to end passes, read back from
Firestore rather than from the page.

The other five cannot be proved this way until R-009 is fixed, because driving
them writes to the live database. That is the honest state of it: not "the
pages fail", but "the proof cannot be run safely yet".

What does pass today, on all seven: the page loads signed in, renders, throws
no uncaught error, computes to Inter and keeps its controls.

---

## Found and not fixed

### R-010 — the Youth Hub help tour throws, and did before this work — FIXED
`showTourStep` in `youthapp2.html` called
`document.getElementById('tour-next')`, and the button at line 1227 had
`class="tour-next"` but no id, so it got null and threw before the tooltip was
ever positioned — the tour was dead.

Confirmed older than this chunk by loading the page with the `egbc-ui.js` line
taken out again: the same error, at the same place, either way.

One attribute, `id="tour-next"`, and nothing else. Same shape as the
CoreTeamApp tour bug fixed in August.

### R-011 — `index.html` and `login.html` now load `egbc-ui.js` but are Group 4
Both are in `NEXT-BRIEF.md`'s list of pages outside v109, so both now load the
engine and are on Inter. Their own content is still the old style and is not
due until Group 4.

---

## Screenshots

`v2/screenshots/restyle/` holds before and after for all seven Group 1 pages at
1280px and 375px, full page, both sets against the same synthetic data. The
after set predates Step A's changes and should be retaken when Group 1 is
actually finished.
