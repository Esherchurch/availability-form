# Next — combined work order and answers to the Group 1 report

For the Code window working in `Esherchurch/availability-form`, `v2/` only. Written 2026-10-06.
This sits **on top of** the three briefs, which stay the spec for their own work:
`v2/RESTYLE-BRIEF.md`, `v2/ONE-APP-BRIEF.md`, `v2/EVENTS-BOOKINGS-BRIEF.md`, `v2/SHARE-NOTIFY-BRIEF.md`.
Where this file and one of those disagree, **this file wins**.

**Step A is done (9a82f685). Step B part 1 is done (73a4de00). Do B1 (settle A-005), then stop and report.** Get the latest from GitHub before you start.

---

## 0. Safety rule — read first (added after Step A)

During Step A, test saves on five pages went to the **live** database: `addressbook.html`, `Planner.html`, `SundayServicePlanner.html`, `CoreTeamApp.html` and `view-only-rota.html` start their own Firebase app with no emulator hook, so "served from localhost" did **not** mean "talking to the emulator". (Martin is removing the five test records himself.)

Until Step B has moved a page onto the shared connection:
- **Never press anything that saves on those five pages, or on any page that calls `initializeApp` itself**, even on localhost.
- Before any test that writes, **prove the page is talking to the emulator** (e.g. its Firestore host is `localhost:8181`) and show that in the report. If you cannot prove it, do not write.
- The live database currently accepts writes without anyone signed in. Treat every unproven write as live.

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

## 5. Step A result and what Step B must also do

Step A was checked against the code (9a82f685): 11 files, all in `v2/`; the theming engine is in `egbc-ui.js` and gone from `egbc-shell.js`; CoreTeamApp, Youth Hub, Availability and login load it; the Youth Hub tour fix (R-010) is in. Thank you for flagging the live writes first and plainly.

**Step B (One app — Chunk 1) is now also the fix for R-009**, and must:
1. **Start with a check** that lists every in-scope v2 page that calls `initializeApp` itself, committed as a small script in `v2/` so anyone can rerun it. It must report **zero** in-scope pages at the end of Step B.
2. Move the five pages above **first**, before any other page.
3. Prove every write in its proof runs against the emulator (§0).

**Then Step A2 — finish Restyle Group 1** (before Step C): R-006 cards and lists rebuilt to the card spec, and R-007 the main-action proof on all seven Group 1 pages — now safe, because they are on the emulator. Group 1 is only done when both are.

## 6. Step B, part 1 result (73a4de00) and what comes next

Checked against the code: 8 files, all in `v2/`. `egbc-db.js` is a clean handle swap (same project, app name `egbc`, its own Auth, emulator hooks, `ready`); the Planner diff changes only the connection, not the save code. The measured table that ruled out candidate (b), and the deliberate break that caught your own first check passing for the wrong reason, are exactly what this work needs. Keep doing that.

**Next, in this order:**

**B1 — Settle A-005 before moving another page.** Planner, CoreTeamApp and resources "save nothing" in the emulator. Establish which of these it is, and say how you know:
- the test pressed the wrong control, or set a value without the real user event (use real clicks / `change` events through the UI, the way a person would);
- the write is refused (catch and log the promise of every write on these pages during the test — a refused write rejects, it does not report success);
- the save was already broken before Step B. You cannot run the pre-Step-B pages safely (they talk to live), so establish this **by reading** the code paths at `c324969e` against `73a4de00`, not by running them.
If Step B caused it, fix it in `egbc-db.js` or the page and re-prove all five. If it is older, record it and fix it as part of A2. **Do not move the other 29 pages until A-005 is explained** — whatever caused it would repeat 29 times.

**B2 — move the remaining 29 pages**, in groups of five to eight, one commit per group, the check script run after each. For every page: first data call gated on `ready` (modular) or `EGBCAuth.require()` (compat); its main action proved against the emulator through the UI. Out-of-scope apps are not touched.

**Then A2** as in §5.

**Launch dependency — add to the checklist (ONE-APP §7) when you build it:** the original site uses **the same database** and its pages connect without signing in. Deploying `firestore.rules` will stop the original site saving, not only unmoved v2 pages. So the rules can be deployed **only at the switch-over to v2**, or with rules that still allow the original site's paths — Martin's decision at launch. Record this as a finding now so it is not lost.

## 7. Step V — no SharePoint anywhere in v2 (after B1, before B2)

Martin's decision: **v2 does not use SharePoint at all.** It has been very problematic. Every video and file lives in Firebase Storage; no page links out to SharePoint.

Checked 2026-10-06 — functional SharePoint uses in `v2/`:
- `EGBC-HowTo-AV.html` — embed-URL only (`SP_SITE`), no upload
- `EGBC-PlayThrough.html` — videos at `SP_VIDEO_BASE` (4 references)
- `EGBC-Training-Worship.html` — the same knowledge-base template, `SP_SITE` — **a fourth KB page**
- `trainingportalhub.html` — a button linking to the SharePoint site
- Comments in `egbc-shell.js` and `hub-app.js` are history, not use — leave them. `SharepointHeader.html` is only for embedding inside SharePoint; nothing in v2 uses it — **leave the file alone** (nothing is deleted).

The detail for the video pages: Checked 2026-10-06: only `EGBC-Troubleshoot-AV.html` was ever moved (`STORAGE_PATH='kb/troubleshoot-av'`, batch upload, `KBTranscribe`). `EGBC-HowTo-AV.html` still takes only an embed URL (`SP_SITE` SharePoint) with no upload, and `EGBC-PlayThrough.html` still points videos at SharePoint (`SP_VIDEO_BASE`) — its file button analyses audio for chords, it does not store the video. No commit ever moved those two.

Build:
1. **One uploader, shared by all four knowledge-base pages** — lift Troubleshoot's upload + transcription into a shared file (e.g. extend `egbc-kbadmin.js`, or `egbc-kbupload.js`) and use it on How-To AV (`kb/howto-av`), Play-Through (`kb/playthrough`) and Worship Training (`kb/training-worship`). Do not paste a third copy. Storage rule `kb/{page}/{fileName}` already covers these paths — check, do not change rules.
2. **"Replace video file"** on an existing entry: upload a file and swap the entry's `contentURL` from the SharePoint link to the Firebase URL, keeping its id, title, category, tags, transcript and bullets. If it has no transcript, make one. This is how existing SharePoint entries move across **without duplicates**.
3. **No new SharePoint links** can be added on any page. Existing SharePoint entries still play until replaced, and each shows a small "Still on SharePoint — replace" marker to admins so the remaining ones are easy to find.
3a. `trainingportalhub.html`: remove the SharePoint button (or point it at the hub). Nothing else on that page changes.
3b. **Gate:** a small rerunnable check in `v2/` that lists every functional `sharepoint.com` reference in in-scope pages (ignoring comments and `SharepointHeader.html`). It must read **zero** at the end of Step V apart from data still to be replaced, which lives in Firestore, not code.
4. Play-Through keeps its chord analysis exactly as it is.
5. Proof against the emulator (§0): upload a synthetic test video on each of the four pages → stored under its `kb/...` path → entry created with a transcript; "Replace video file" on a seeded SharePoint entry → same id, Firebase URL, other fields unchanged. Break the shared uploader and show all four pages' checks failing.

**Do not upload Martin's real videos** — Claude in Martin's other window does that once this is live, after matching each file against what is already on the pages.

## 3. Order of work across the three briefs

One step at a time. Stop and report after each. Pull before each step; commit small; push often.

| Step | Work | Brief |
|---|---|---|
| ~~A~~ | ~~Restyle Group 1, first pass~~ — **done (9a82f685)** (engine into `egbc-ui.js`, emoji, team colours, cards, phone overflow, view-as strip, main-action proof) | RESTYLE + this file |
| B1 | Settle A-005 (§6) | this file |
| V | **No SharePoint in v2** — four knowledge-base pages onto Firebase, training portal link removed (§7) | this file |
| B | **One app — Chunk 1:** every in-scope page onto the one signed-in connection — **the five live-writing pages first** (§0, §5) | ONE-APP |
| A2 | **Finish Restyle Group 1:** cards and lists (R-006), main-action proof on all seven pages (R-007) | RESTYLE |
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
