# Next — combined work order and answers to the Group 1 report

For the Code window working in `Esherchurch/availability-form`, `v2/` only. Written 2026-10-06.
This sits **on top of** the three briefs, which stay the spec for their own work:
`v2/RESTYLE-BRIEF.md`, `v2/ONE-APP-BRIEF.md`, `v2/EVENTS-BOOKINGS-BRIEF.md`, `v2/SHARE-NOTIFY-BRIEF.md`.
Where this file and one of those disagree, **this file wins**.

**Do Step A only, then stop and report.** Get the latest from GitHub before you start.

---

## 1. On the Group 1 report

Good report. Two things worth saying back:
- Deleting your own `egbc-theme.css` once v109 landed was the right call, and the reason you gave — v109 leaves `contenteditable` alone, your sheet would have restyled emails before they were sent — is the right reason.
- Fixing `egbc-auth.js` to point at the emulator on 8181 was a real fix. Thank you.

**One correction:** R-008 says the "VIEW THE SITE AS" strip is drawn by the shell. It is drawn by **`egbc-auth.js`** (checked: it is the only file containing that text). It is in scope for Step A.

**One addition to R-002:** CoreTeamApp is not the only page outside v109. These in-scope pages do not load `egbc-shell.js`, so the theming engine never runs on them: **`CoreTeamApp.html`, `youthapp2.html` (Youth Hub), `index.html` (Availability), `login.html`** (and `hub.html`, which is already styled by hand).

## 2. Answers to the findings

| Finding | Answer |
|---|---|
| **R-002** CoreTeamApp gets none of v109 | **Do not add the bar** to companion phone apps that have their own app header (CoreTeamApp, Youth Hub) — two headers on a phone is worse. Instead **move the theming engine out of `egbc-shell.js` into `egbc-ui.js`**, unchanged in behaviour (contenteditable still skipped, `data-theme="off"` still honoured — read it from either script tag). `egbc-shell.js` already loads `egbc-ui.js`, so every page with the bar keeps it. Then load `egbc-ui.js` on CoreTeamApp, Youth Hub, Availability and login. One engine, one place — do not leave a copy in the shell. |
| **R-003** emoji in the interface | **Replace them** with Lucide icons via `egbc-ui.js` (`<i data-lucide>`; `EGBCUI.pageIcon` for registry pages). Emoji inside people's own content (notices, notes, song text) stay. CoreTeamApp's home tiles and resources.html's empty state are in Group 1. |
| **R-004** team colours as fills | Follow `DESIGN.md`: team colour as an **8px dot** beside the name. Selected tabs use the brand selected style (tint background, ink text), not the team colour. |
| **R-005** cards and lists not rebuilt | **In Group 1.** Rebuild to the card and list spec in `DESIGN.md`, copying `hub.html` / `meeting.html`. Look only — same ids, same functions. |
| **R-006** load-and-render instead of main action | **Required before Group 1 counts as done.** For each of the seven pages, do its main action end to end against the emulator with synthetic people (e.g. rota: open and change an assignment; address book: add and edit a person; service planner: build and save an order). Pass/fail per page in the report. |
| **R-007** Planner and Service Planner overflow a phone | **Fix in Group 1.** Rota Planner and Service Planner are phone apps (`manifest-planner.json`, `manifest-service.json`), so they must work at 375px. Wide tables may scroll **inside their own box**; the page itself must not scroll sideways. |
| **R-008** "VIEW THE SITE AS" uppercase | Sentence case ("View the site as"), DESIGN.md style. It is in **`egbc-auth.js`** — change only that strip's look, nothing about how viewing-as works. |

## 3. Order of work across the three briefs

One step at a time. Stop and report after each. Pull before each step; commit small; push often.

| Step | Work | Brief |
|---|---|---|
| **A** | **Finish Restyle Group 1** with the answers above (engine into `egbc-ui.js`, emoji, team colours, cards, phone overflow, view-as strip, main-action proof) | RESTYLE + this file |
| B | **One app — Chunk 1:** every in-scope page onto the one signed-in connection | ONE-APP |
| C | **Events — Chunk 2:** events and sign-ups (`contacts` first) | EVENTS |
| D | One app — Chunk 2: EGBC Hub as the main app, companions, Meet tab, real-phone tests | ONE-APP |
| E | **Share — Chunk 1:** Share to WhatsApp on notices and meetings (events join when built) | SHARE-NOTIFY |
| F | **Notify — Chunk 1:** establish how notifications can be sent; write Martin's manual steps; **stop before building** | SHARE-NOTIFY |
| G | Events — Chunk 3: check-in, attendance, forms and safeguarding | EVENTS |
| H | Restyle — Group 2 (Worship & AV pages) | RESTYLE |
| I | Events — Chunk 4: room bookings | EVENTS |
| J | One app — Chunk 3: profile, household, opt-in directory | ONE-APP |
| K | **Notify — Chunk 2:** build notifications (preferences live in the profile from J) — only once Martin has done the manual steps from F | SHARE-NOTIFY |
| L | Events — Chunk 5: hire, charges, hirer compliance | EVENTS |
| M | Restyle — Group 3 (Youth & kids — **Worship Hub excluded**) | RESTYLE |
| N | Events — Chunk 6: Sunday kids registration | EVENTS |
| O | Events — Chunk 7: small groups and the giving seam | EVENTS |
| P | Restyle — Group 4 (everything else, including login and the Availability form) | RESTYLE |
| Q | One app — Chunk 4: launch checklist page (last, so it lists everything) | ONE-APP |

Why this order: B comes before C so every new events page is built on the signed-in connection from the start. Share comes after D because it is tested on the installed apps; notifications need Martin's console steps (F) and the profile page (J) before they are built (K). Restyle groups are spread out so the look keeps up with what is being built.

## 4. Standing rules (all steps)

- **Out of scope everywhere:** Worship Hub (`worshiphubapp.html`, `manifest-worship.json`), Mix Builder (`mix-*`, `manifest-mix.json`), Calla Design (`studio.html`, `manifest-studio.json`). Do not touch them — this overrides `RESTYLE-BRIEF.md`, which listed `worshiphubapp.html` in Group 3.
- **No app is retired, merged or removed — ever, in any step.** Every phone app that exists today keeps working, in `v2/` and on the original site. For each app's manifest: **never change `id`, `start_url` or `scope`**, and never delete the manifest or its start page — that would break the app on phones where it is already installed. The only manifest changes allowed are those a brief names (e.g. the display name), and **app names change only after Martin approves each one**.
- **Nothing outside `v2/`.** The original site stays exactly as it is until Martin launches v2.
- **Synthetic data only.** Emulator, made-up people. Never read or copy real records.
- **Do not deploy Firestore or Storage rules.** Martin deploys.
- Every page follows `DESIGN.md` and works at 375px.
- Findings go in that work's FINDINGS file, numbered. Take the reading that builds least; stop only if you cannot proceed.
- **Each report:** files changed · deliberate breaks and which test caught each · the lock-out check (every page still works; `git diff --stat` shows nothing outside `v2/`) · found and not fixed, numbered · the one proof that matters, named on its own.

---

Step A first. Report after it and wait.
