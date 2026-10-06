# Findings — restyling the v2 pages

Numbered for the Code windows. Every claim about existing code was made after
opening the file named.

Group 1 opened 2026-10-06.

---

## R-001 — the shared stylesheet was written, then withdrawn

The seven group 1 pages are not built the same way: five are Tailwind utility
classes from the CDN (`view-only-rota`, `Planner`, `SundayServicePlanner`,
`addressbook`, `resources`), two are hand-rolled CSS (`CoreTeamApp`, `videos`),
only one already had a token override block, and all seven loaded Montserrat.

This chunk first answered that with a shared stylesheet, `v2/egbc-theme.css`,
linked from each page. **v109 landed the same idea done better**, inside
`egbc-shell.js`: it walks the page's own stylesheets as they load — including the
one Tailwind writes at run time — and rewrites Montserrat, capitals, wide
letter-spacing, 800/900 weights and pill radii in place, with `data-theme="off"`
to opt out.

It is better in a way worth naming, because it is the case the stylesheet got
wrong: **v109 skips `contenteditable`**, so the email builder's body is left
exactly as composed. A blanket stylesheet would have restyled what people are
about to send.

`egbc-theme.css` was therefore deleted and the seven links removed. Two
mechanisms doing one job is how a fix looks finished and is not.

**What remains from this chunk** is per-page work v109 cannot do from outside:
the Montserrat `<link>` removed from all seven, `font-family` declarations
rewritten to Inter, and one style string in `CoreTeamApp.html` rebuilt.

---

## R-002 — `CoreTeamApp.html` gets none of v109

It is the only one of the seven with no `egbc-shell.js`, so the bar never loads,
so the v109 theming never runs on it. It is on Inter only because this chunk
removed its Montserrat link and rewrote its `font-family` declarations by hand.

Everything else there is untouched and visibly so: the uppercase "EGBC WORSHIP &
AV" strapline, emoji tile icons, coloured card borders. Compare
`coreteamapp-after-desktop.png` with any other after shot.

Two ways out — add the shell to it, or restyle it by hand. It is a standalone
phone app page and adding the bar changes what is on screen, so neither was
assumed.

---

## What group 1 does NOT yet cover

Typography, shape and colour are in line and nothing broke. These parts of
`DESIGN.md` are not done.

### R-003 — emoji are still in the interface
`DESIGN.md` says no emoji; the brief says replace each with a Lucide icon.
Neither a stylesheet nor v109 can do it: each one is a character in markup or in
a JS string, and the ones inside user content have to be left alone.

Still there, for example: the folder on the empty state in `resources.html`, and
the tile icons on the `CoreTeamApp.html` home screen.

One was done, because it sat in a string that also carried Montserrat, weight 800
and a pill radius: the meetings list in `CoreTeamApp.html` (`renderMeetings`).

### R-004 — team colours are still used as fills
`DESIGN.md`: team colours appear "only as an 8px dot beside the team name — never
as fills or thick borders". The selected team tab in `resources.html` is a solid
fill in the team's colour (Core Team draws purple). That is markup, per page.

### R-005 — cards and lists are not rebuilt to the card spec
`DESIGN.md` describes a card as a 32px tinted icon badge, a title, actions right,
divider below; a list row as a 34–36px icon box with a name and one muted line.
Retuning tokens cannot produce that structure. Not written.

### R-006 — "main action end to end" was not proved
The brief asks for each page's main action done end to end against test data.
What was run is weaker and should not be read as the stronger thing: every page
loads signed in, renders, throws no uncaught error, computes to Inter and still
has its controls — 28 checks, all passing, against synthetic people in the
emulator, before and after `egbc-theme.css` was withdrawn.

Driving a rota edit, a service plan, an address book entry, a resource upload and
a video add is the obvious next step, and the thing most likely to find what the
screenshots hide.

---

## Found while working, not caused by the restyle

### R-007 — two pages overflow a phone screen, and did before
`Planner.html` lays out 476–527px wide inside a 375px viewport;
`SundayServicePlanner.html` 598px. The before shots show the same, so this is not
the restyle's doing — but the brief says every page works at 375px, so neither
does yet.

### R-008 — the admin strip is still in the old style
The "VIEW THE SITE AS … as an admin" bar along the bottom of every page is still
uppercase. It is drawn by the shell, not by any of the seven, so it sat outside
group 1's file list. It will look out of place on every page until it is done.

---

## Screenshots

`v2/screenshots/restyle/` holds before and after for all seven at 1280px and
375px — 28 files, full page rather than viewport, both sets against the same
synthetic data. The after set was retaken once `egbc-theme.css` was withdrawn, so
it shows what actually ships.
