# Findings — restyling the v2 pages

Numbered for the Code windows. Every claim about existing code was made after
opening the file named.

Group 1 opened 2026-10-06.

---

## R-001 — one shared stylesheet, not seven page rewrites

The seven group 1 pages are not built the same way: five are Tailwind utility
classes from the CDN (`view-only-rota`, `Planner`, `SundayServicePlanner`,
`addressbook`, `resources`), two are hand-rolled CSS (`CoreTeamApp`, `videos`),
only one already had a token override block, and all seven loaded Montserrat.

Restyling each by hand would be seven chances to make the same decision slightly
differently, and forty-five by the end of group 4. The decisions live in
**`v2/egbc-theme.css`** instead. A page joins the look by dropping its Montserrat
link and gaining one line:

    <link rel="stylesheet" href="egbc-theme.css?v=...">

Nothing else changed in any of the seven — no markup, no ids, no script — which
is why "no behaviour change" could be checked rather than hoped for.

The sheet is deliberately last in the cascade and uses `!important` against the
old utility classes, because Tailwind's utilities are what it has to overrule.

**This is a deviation from the brief**, which says to copy `hub.html` and
`meeting.html` per page. Worth confirming before group 2 is done the same way.

---

## What group 1 does NOT yet cover

The typography, shape and colour pass is done and proven not to break anything.
These parts of `DESIGN.md` are not done, and the pages do not yet fully comply.

### R-002 — emoji are still in the interface
`DESIGN.md` says no emoji, and the brief says replace each with a Lucide icon.
A stylesheet cannot do that: each one is a character in markup or in a JS string
and has to be replaced by hand, one at a time, while leaving emoji that are
inside user content alone.

Still there, for example: the folder on the empty state in `resources.html`, and
the tile icons on the `CoreTeamApp.html` home screen.

One was done, because it sat in a string that also carried Montserrat and a pill
radius: the meetings list in `CoreTeamApp.html` (`renderMeetings`).

### R-003 — team colours are still used as fills
`DESIGN.md`: team colours appear "only as an 8px dot beside the team name — never
as fills or thick borders". The selected team tab in `resources.html` is a solid
fill in the team's colour (Core Team draws purple). Changing it is a markup
change in each page, not a token.

### R-004 — `CoreTeamApp.html` never loads the shell, so it has no icons
It is the only one of the seven without `egbc-shell.js`, so it does not get
`egbc-ui.js`, so Lucide is not available on it at all. It now gets Inter from the
theme sheet, but any icon work there needs `egbc-ui.js` adding first. It is a
standalone phone app page, so that was left alone rather than assumed.

### R-005 — cards and lists are not rebuilt to the card spec
`DESIGN.md` describes a card as a 32px tinted icon badge, a title, actions on the
right and a divider below, and a list row as a 34–36px icon box with a name and
one muted line. The theme sheet can only retune what is already there; that
structure is per-page markup and has not been written.

### R-006 — "main action end to end" was not proved
The brief asks for each page's main action done end to end against test data.
What was actually run is weaker, and should not be read as the stronger thing:
every page loads, renders, throws no uncaught error, computes to Inter, and still
has its controls — 28 checks, all passing, against synthetic data in the emulator.

Doing it properly means driving a rota edit, a service plan, an address book
entry, a resource upload and a video add. That is the obvious next step, and it
is the thing most likely to find something the screenshots hide.

---

## Found while working, not caused by the restyle

### R-007 — two pages overflow a phone screen, and did before
`Planner.html` lays out 527px wide inside a 375px viewport, and
`SundayServicePlanner.html` 598px. The before screenshots show the same widths,
so this is not the restyle's doing — but the brief says every page works at
375px, so neither does yet.

### R-008 — the admin strip is still in the old style
The "VIEW THE SITE AS … as an admin" bar across the bottom of every page is still
uppercase. It is drawn by the shell, not by any of the seven, so it is outside
group 1's file list and was not touched. It will keep looking out of place on
every page until the shell is done.

---

## Screenshots

`v2/screenshots/restyle/` holds before and after for all seven, at 1280px and
375px — 28 files, full page rather than viewport. The before set was taken with
the same synthetic data as the after set, so the pairs are comparable.
