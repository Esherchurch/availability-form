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
2. **Worship & AV:** `Library.html`, `batchupload.html`, `music-uploader.html`, `EmailBuilder2.html`, `stickynotes.html`, `EGBC-PlayThrough.html`, the AV how-to and troubleshoot pages, the charters.
3. **Youth & kids:** `youthapp2.html`, `youthserviceplanner.html`, `youth-access.html`, `worshiphubapp.html`.
4. **Everything else** in `v2/`, including `login.html` (first thing anyone sees — make it good) and `index.html` (the public availability form).

## Each report
1. Files changed.
2. A before/after screenshot of each page at desktop and 375px, saved under `v2/screenshots/restyle/`.
3. How you proved nothing broke (the page's main action done end to end against test data).
4. Anything found and not fixed, numbered in `v2/FINDINGS-restyle.md`.

Group 1 first. Report after it and wait.
