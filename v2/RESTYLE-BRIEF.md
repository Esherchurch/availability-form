# Restyle the remaining v2 pages — brief for a Code window

Written 2026-10-06. Martin writes no code; this is the spec.

## What and why
v108 gave the Team Hub a professional look: Inter, Lucide line icons, sentence case, quiet greys around the EGBC teal. The shared bar and menu (`egbc-shell.js`) already carry it onto every page. The **content** of the other ~45 pages is still the old style (Montserrat, uppercase labels, pill buttons, emoji). Bring each page into line with **`v2/DESIGN.md`**, using `hub.html` and `meeting.html` as the reference.

## Rules
- **Look only. No behaviour change.** Same ids, same functions, same data. If a restyle needs a logic change, stop and record it in `v2/FINDINGS-restyle.md`.
- Read `v2/DESIGN.md` first. Reuse `egbc-ui.js` (icons) and `egbc-editor.js` (any place someone types formatted text — replace any "type HTML here" textarea with it).
- Replace every emoji in the interface with a Lucide icon. Emoji inside user content (notices, song notes) stay.
- Every page still works on a phone at 375px and keeps working with the bar on top (`egbc-shell.js` pushes sticky headers down — do not fight it).
- **Synthetic data only** when testing. Never read or copy real people's records.
- Do not deploy Firestore rules. Pushing to `main` deploys the site — commit one group at a time.
- Bump `HUB_BUILD` in `hub-app.js` only if you touch the hub.

## Order (one group per commit; stop after each group and report)
1. **Most used:** `view-only-rota.html`, `Planner.html`, `CoreTeamApp.html`, `SundayServicePlanner.html`, `addressbook.html`, `resources.html`, `videos.html`.
2. **Worship & AV:** `Library.html`, `batchupload.html`, `music-uploader.html`, `EmailBuilder2.html`, `stickynotes.html`, `EGBC-PlayThrough.html`, the AV how-to and troubleshoot pages, the charters, and **`hub.html` including its admin panel** (the cog: People, Pages, Notices, Youth codes, and the team picker).

   **Why the hub is here.** It was rebuilt in Step D and was never in Group 1, so nothing had measured it until S2c counted the emoji and found 42 had been taken out of it. `node tests/check-style-every-screen.mjs --all` reports **167** problems on it, **152** on the pin board and **81** on Play-Through — mostly 700 weights, and on the hub mostly inside the admin panel, which is why that panel is named here: it is behind a button, and a measurement that does not open it reports zero.

   **Keep the structure and the order exactly** (NEXT-BRIEF §15). Which tools appear and in what order, which tabs the admin panel has and in what order, the columns of every list, the fields of every form: all unchanged. The restyle changes how things look, never what is there or where it is. If you think a structural change is right, write it in `FINDINGS-restyle.md` and leave it alone.

   Three checks already walk these pages and will tell you if you break them:
   `tests/check-style-every-screen.mjs --all` (the look, every screen),
   `tests/check-icon-buttons.mjs` (every control still reads as a control) and
   `tests/check-hub-tools.mjs` (the hub still offers every page it offered).
   Drop `restyled: false` from a page in `tests/group1-screens.mjs` once it is done, so the style check starts asserting on it.
3. **Youth & kids:** `youthapp2.html`, `youthserviceplanner.html`, `youth-access.html`, `worshiphubapp.html`.
4. **Everything else** in `v2/`, including `login.html` (first thing anyone sees — make it good) and `index.html` (the public availability form).

## Each report
1. Files changed.
2. A before/after screenshot of each page at desktop and 375px, saved under `v2/screenshots/restyle/`.
3. How you proved nothing broke (the page's main action done end to end against test data).
4. Anything found and not fixed, numbered in `v2/FINDINGS-restyle.md`.

Group 1 first. Report after it and wait.
