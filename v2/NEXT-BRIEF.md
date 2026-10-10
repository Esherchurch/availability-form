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

## 8. Step B done (4b6c375e) — what comes next

Checked: `check-firebase-apps.mjs` reads **0** in scope, 35 on the shared connection, 1 second project (data-tools restore target, legitimate); nothing outside `v2/` changed since B1; `egbc-db.js` uses `persistentLocalCache` with `persistentMultipleTabManager` (right for several tabs); the inventory double `const db` is fixed. Good work, and thank you for A-013 — saying plainly what was not proved.

**Next: Step A2 — finish Restyle Group 1.** The main-action proof for the seven Group 1 pages is done (B1 + Step B). What remains is **R-006: cards and lists rebuilt to the card spec** on those seven pages. Group 1 is done when that is.

**A-013 carries forward:** every later restyle group (H, M, P in §3) must include each of its pages' **main action, end to end, through the UI, against the emulator** — the restyle touches every page anyway, so that is where the proof belongs. The launch checklist (Q) lists any page still without it.

Then **Step C** (Events — Chunk 2).

Since Step V, Martin also has these done in this window (already on `main`, nothing to redo): 22 knowledge-base videos moved to Firebase through Replace (no duplicates), 2 new How-To AV videos with transcripts (made on Martin's PC — Whisper works), the bar's bottom spacing, the view-as strip (team list readable, "as an admin" waits for a team, strip behind pop-ups at z-index 40), and `egbc-kbadmin.js` now showing the Admin button to admins (it used to hide it for good before the profile loaded; `egbc-ready` is never dispatched, so it re-checks on `EGBCAuth.optional()`). If you touch those files, pull first.

## 9. A2 done (2998c851) — Step C next

Checked: the four remaining Group 1 pages, screenshots read (rota and Rota Planner match the card spec, synthetic data only), nothing outside `v2/`. The rendered-page style check you wrote after the class-string break slipped past the script check is the right tool for styling work — keep using it.

**Next: Step C (Events — Chunk 2).** New pages follow `DESIGN.md` from the start, including controls, so they do not add to R-012/R-013.

**A3 — controls and emoji on Group 1** (R-012 buttons, selects and form labels; R-013 about 100 emoji, mostly CoreTeamApp — use a word where an icon cannot go, e.g. inside an `<option>`). Scheduled **after Step D**, as its own step. Not now.

**F-013** (a fresh hub with no registry applied shows 0 tools) goes on the launch checklist (Q), not fixed now.

## 10. Chunk 2 (Events) accepted (2fd48116) — Martin's decisions on the findings

- **F-018 Rota parity: not wanted.** The availability form gathers the data, auto-fill spreads serving by frequency, and volunteers will not use accept/decline. Do not build accept/decline, swaps, self sign-up, reminders or clash reports. (Lesson for both windows: survey how the church actually runs the rota before calling something missing.)
- **Rota calendars:** rota emails already attach an .ics. A subscribable rota feed is **not** requested. (F-015's subscribe item is about the events feed only; leave it with the server chunk.)
- **F-016 Pictures: admins only.** Event and room pictures may be uploaded only by admins (or the event's overseers if Martin says so later). Fix `storage.rules` with rules tests and a deliberate break. Martin will say what "send a link to people" means before anything else is built for it.
- **F-014 email service:** confirmed open — an empty POST is answered without any login. The service is Calla's (Resend). It is fixed **in Calla**, not here, from a separate brief. Do not change the hub's email calls until that brief lands.
- **F-019 index:** Martin deploys indexes only (`firebase deploy --only firestore:indexes`) — safe, it cannot lock anyone out.

**Next: Step D** (One app — Chunk 2), then A3.

## 11. Martin's decisions, 7 Oct 2026 (these replace two lines in §10)

**These replace the "Rota calendars" and "F-016" lines in §10.**

- **Live rota calendar: wanted.** Each person gets their own subscribe link (Google, Apple, Outlook). It shows only their own rota slots and stays up to date when the rota changes, with no new email needed. The .ics attachments on rota emails stay as they are.
  - It needs a small server: a Cloud Function in `egbc-worship-planner`, code in **`v2/functions/`**, Firebase `codebase: "hub"` in `v2/firebase.json`.
  - The link carries a long random key per person, stored in Firestore and readable only by that person. "Reset my calendar link" stops the old one working. The feed holds times, role and service only: no other people's names, no private notes.
  - The same function serves the **events feed** (F-015's subscribe item). One server step, not two.
  - **Deploy safety:** `sendEmail` lives in the same Google project but belongs to the Calla window and is not in this repo. Martin deploys only with `firebase deploy --only functions:hub` (or the named function). **Never a bare `firebase deploy --only functions`**, because it would offer to delete `sendEmail`. Say this plainly in the hand-over steps.
  - Test on the Functions emulator with synthetic data only.
  - **When:** **Step R, before launch** (see §12). Build the rota feed first; the events feed waits until after launch. Establish first, build second, stop and report.
- **F-016 "send a link to people" means a one-off upload link** (e.g. pictures from a party). An admin makes a link for an event; anyone with the link can upload pictures without signing in.
  - `uploadLinks/{randomId}`: event, made by, expiry (default 14 days), max files (default 50), on/off. An admin can switch it off at any time.
  - New page `upload.html?k=…`: phone-first, pick photos, upload, thank-you. No account; name optional.
  - Storage path `uploads/{linkId}/…`. `storage.rules` allows a write only when the link exists, is on and unexpired, the file is an image (JPEG, PNG, HEIC, WebP) and under 15 MB. Only admins can read or list them. Rules tests with deliberate breaks: expired link, switched-off link, a PDF, a 20 MB file, a guest trying to read.
  - **Safeguarding:** uploads land in a **review queue** in `events-admin.html`. Nothing appears anywhere until an admin approves it, because photos may show children. Approve, reject, download all as a zip. Rejected files are deleted by Martin, not by code you run.
  - Share the link with Share to WhatsApp (Step E) and a QR code.
  - **When:** with **Step G** (Events Chunk 3), after launch (see §12).

## 12. The launch line (Martin, 7 Oct 2026) — this order replaces the table in §3

**Before switch-over, v2 only has to match what the original site does today, plus what is already built, plus the live rota calendar.** Events, room hire and everything else the original site never had come **after** launch. Do not extend events or bookings before launch. What is already built (Events Chunks 1–2, sign-up pages, Places) stays, and must not break, but gets no new features.

**Before switch-over, in this order:**

| Step | Work |
|---|---|
| A3b | Finish Group 1: every screen, tab, sheet and modal measured, not just the first view |
| S | **Parity audit (establish only, then stop and report).** List every page and every action on the original site (repo root, outside `v2/`). For each, name the v2 page that does it and prove it works in v2 on the emulator with synthetic data. Gaps go in a numbered list. Do not build, and do not call something missing without checking how the church actually uses it (see the F-018 lesson). |
| S2 | Close the parity gaps Martin approves from S |
| R | Live rota calendar (§11). The events feed waits until after launch. |
| H | Restyle Group 2 (Worship & AV) |
| M | Restyle Group 3 (Youth & kids, **Worship Hub excluded**) |
| P | Restyle Group 4 (everything else, including login and the Availability form) |
| T | Email lock, hub side: v2 pages onto `egbc-email.js` with the sign-in token. Only once the Calla window's Stage 2 is deployed and accepting both ways. |
| Q | Launch checklist page, plus Martin's switch-over steps in plain words: rules deploy, indexes, app renames (A-014), phone tests, turning off the email service's old way |

**After launch, in this order:** E Share to WhatsApp, F/K notifications, G check-in, forms, safeguarding and the one-off upload links, the events calendar feed, I room bookings, J profile and directory, L hire and charges (Condeco level), N kids registration, O small groups and the giving seam.

## 13. A3b accepted (f1a843be) — one safety fix before Step S

A3b checked: Group 1 at 0 off-spec across every screen. The 800 weights left in Planner and the Sunday planner are inside the emailed templates (R-020, agreed).

**The near-miss.** The A3b check pressed "Send all rotas". Only the sign-off failsafe stopped real email going to the whole team. `egbc-email.js` already sends nothing on localhost, but **nine places still call the live service directly**: CoreTeamApp (2), EmailBuilder2, Planner (3), SundayServicePlanner, youthapp2, youthserviceplanner and hub-app.js. Step S is about to exercise every action, including sending, so close this first.

**S0 (do first, before the audit):**
- In `egbc-auth.js` (loaded on every page), when the host is localhost, 127.0.0.1 or [::1], wrap `fetch` so that any request to the sendEmail service (either address, `sendemail-irkwdhx3xq-uc.a.run.app` or `cloudfunctions.net/sendEmail`) never leaves the machine. It goes into the same outbox `EGBCEmail.outbox()` uses and answers `{ ok: true, stubbed: true }`. Do the same for `XMLHttpRequest` if any page uses it.
- The live site (github.io) is untouched.
- Deliberate break: on localhost, call the service directly from a page with the guard removed, and show the test catches it (the request is attempted). With the guard in place, it lands in the outbox.
- Prove it on Planner's "Send all rotas" with a synthetic signed-off term. The outbox holds the rota emails, and **nothing** reaches the network: check the browser's network log for zero requests to either address.
- Moving these pages onto `egbc-email.js` properly stays in Step T.

## 24. From the research, what Martin wants and what he does not (10 Oct 2026)

**A value that governs everything here.** Martin: *"we are not making people check in to church … I am not comfortable logging when people come in and out of church. That is a very unhealthy church culture."*
- **Never record or track adults' attendance.** No adult check-in, and no "who hasn't been seen" for adults.
- The member directory **already exists**. The Email Builder **already exists**. Improve them; don't duplicate them.

**Before launch:**
- **Safeguarding for everyone working with under-18s (Martin):** not only Kids Church. A **"Works with under-18s" tick** on each **team** (in the teams data) and on each **event or club** (events-admin) makes an in-date DBS check and training **required** for its leaders, helpers and rota slots.
  - **Teams ticked at launch:** Kids Church, Creche, **Youth Worship**, Lazers, ReNu.
  - **Events and clubs:** **Kids Film Club**, Puppet practice, youth events, and anything a leader ticks.
  - **Under-18s small groups** already work this way (F-109); use the same checks records and the same exception route (master admin or safeguarding lead, with a reason).
  - **Main window:** the tick on teams, and the check in Planner and the Core Team rota (a person can't be put on a ticked team's slot).
  - **Events window:** the tick on events and clubs, the check when naming leaders and helpers, and reminders before a DBS check or training runs out.
  - Rules-enforced, with tests and deliberate breaks (e.g. a Youth Worship leader with no DBS can't be put on the youth rota, and a Kids Film Club helper with expired training can't be added).

- **"I'm worried about someone" (Martin, 10 Oct 2026):** a button on **every** version of the app (Me and my family, every team space, Running things) and in the Menu. *"We are not tracking it, but if someone notices that X has not been in church for a while they can flag it if they are worried. It may be an older person getting isolated."*
  - **People-led, never automatic.** Nothing counts or watches anyone; a person chooses to speak up. This fits the rule above.
  - **Two choices on one short form:**
    - **A pastoral concern** (e.g. "haven't seen them for a while", "seems lonely", "going through a hard time"): goes to the **pastoral team**.
    - **A safeguarding concern** (a child or adult may be at risk): goes **only** to the **safeguarding lead and deputy**. The form says first, in plain words: *"If someone is in immediate danger, call 999."* and shows the safeguarding lead's phone number.
  - Fields: who it's about (pick from the address book, or type a name), what you've noticed, and whether you're happy to be contacted. Nothing else is required.
  - **Private.** The person it's about never sees it, and it never shows on their address-book record, profile, the directory or any list. The person who raised it sees only "Thank you, it has been passed on." Rules-enforced: only the named readers can read a concern; nobody can edit or delete one except the safeguarding lead (who can mark it "dealt with" with a note). Tests and deliberate breaks, e.g. an ordinary member or team leader can't read one, and the person named can't.
  - The readers get a **notification and an email** (no details in either, just "a new concern has been raised", with a link).
  - The **safeguarding lead confirms** who reads each kind and how long concerns are kept, before switch-over.
  - **Main window** builds it (one form, rules, the Menu entry, a button in the app shell). Small.

**After launch (in this order unless Martin says otherwise):**
1. **Better group emails:** improve `EmailBuilder2.html` with saved templates, a record of what was sent and who to, a choice of a team, group, family or everyone as recipients, and sending as a notification too.
2. **Serving too often:** the address book already holds each person's **maximum serving number**, which the rota uses. Add a **threshold** the office sets, so when someone is near or over it, their team leader gets a gentle prompt to check in with them. No new tracking.
3. **Kids Church families not seen for a while:** for **families with children registered in Kids Church only**, if none of the children have been checked in for (say) 6 weeks, the **Kids Church leads** get a gentle "it might be worth checking in" prompt. **Nothing for adults, ever.** It uses only the kids check-in that already exists.
4. **Fill a rota gap:** when someone marks a date unavailable on the availability form, offer the gap to suitable free people with a one-tap "I'll do it" link. *To be discussed with Martin first*, given F-018.

## 23. Phone notifications are part of the launch (Martin, 10 Oct 2026)

Martin: *"we want it from the start."* Push notifications are **before switch-over**, built with the app (§22), not after it. The plan is in the events window's `FINDINGS-notify.md` (N-1 to N-6, decisions recorded).
- **Events window:** builds notifications (`egbc-notify.js`, preferences, "call a parent" as the first type).
- **Main window:** N-4 (the sending function in codebase "hub") and N-5 (the service-worker line, registering it, and Menu/profile links).
- **Messages at launch:**
  - **call a parent** (code and group only)
  - **rota reminder** the day before you serve
  - **booking confirmed / approved / declined**
  - **a new maintenance job** (to the Maintenance team)
  - **an urgent notice** from the office

  Each person chooses which they get. Email stays as the fallback for anyone without the app installed.
- **N-1 is DONE (10 Oct 2026).** The reviewing window generated the Web Push key pair in Firebase (Project settings → Cloud Messaging; Firebase Cloud Messaging API V1 is Enabled). The **public VAPID key**, which is safe in client code, is:
  `BFrIuBbcmauGFmFx0w_E5HsNdGolDZErMT5xpxCgdoRNDe9kJeugCHi3MHjlGaqe2uAVnWD9wR_GQQl75OuGIK4`
  The private half stays in Firebase; never ask for it.
- **Both Android and iPhone from day one (Martin).** Android works in Chrome and when installed. iPhone works from iOS 16.4 once the hub is added to the Home Screen: detect an iPhone that hasn't added it, and show a short, friendly 'Add to Home Screen, then turn on notifications' guide with pictures. Test the real flow on both.
- iPhone needs iOS 16.4+ and the app added to the Home Screen; the app should explain that in one friendly line when someone turns notifications on.

## 22. The phone app design is now BEFORE switch-over (Martin, 9 Oct 2026)

Martin chose to **hold launch until the new app design (`APP-DESIGN-BRIEF.md`, mock-up in `v2/design/app-mockup.html`) is built**, so members only learn one new thing. This changes the §12 launch line: the app design joins the "before switch-over" list.

The order for the main window from here:
1. Finish the youth access fix and the ChurchShow hub side, which are already in hand.
2. **App design, stage A1 (establish):** what each space needs from existing pages, what is missing, and what the family rule needs from the data. Stop and report.
3. Build the app shell in stages (spaces, tabs, Home, Me, the family rule, Running things, the phone fixes, A-038), alternating with **Step M** and **Step P** (the restyle), so neither stalls.
4. Step T (email lock), then Q (launch checklist, with the app on it).

The events window builds its own screens inside the spaces (APP-DESIGN-BRIEF §8), after "Who can come". **Sermons (Listen)** are now before launch too.

## 26. Must be on the launch checklist (Q) — collected as we go

The reviewing window adds to this list whenever a report says "before this goes live". Step Q copies every line into the checklist page and Martin's plain-words switch-over steps.
1. **Deploy order:** the hub functions (`--only functions:hub`, including whoAmI, redeemYouthCode and the N-4 senders) go live **before** the rules.
2. **IAM:** `roles/iam.serviceAccountTokenCreator` on the runtime service account (SERVER-DEPLOY.md).
3. **Rules and indexes deploy** (Martin).
4. **Email lock** (Calla, Stage 2), allowing the hub's service account first.
5. **"Church office" group has its people in it** (§25). Until it does, the office loses the Address Book and Email Compiler in the Menu. Master admin still sees everything. Martin says who goes in it.
6. **Real-phone proof (N-7):** notifications on an Android phone and an iPhone (installed to the home screen), once N-4 and N-5 are live.
7. **Share on real devices:** WhatsApp from Android, iPhone and the PC (FINDINGS-share.md).
8. **ChurchShow pairing** in switch-over week, on the projection PC.
9. **The safeguarding lead confirms:** DBS and training periods (annual), the leader ratio (1:5), who reads each kind of "I'm worried about someone" concern, and how long concerns are kept.
10. **Martin confirms the teams list** (APP-DESIGN-BRIEF §6).
11. **App renames**, only if Martin approves (A-014).

## 25. Running things: the office chooses what each person sees (Martin, 10 Oct 2026)

Martin: *"the church Admin might not be core team"* and *"we need to select what people see."*

Today `egbc-app.js` `spacesFor()` shows the whole Running things space to **anyone who is an admin of anything, or on Core Team**. That is wrong both ways: the church administrator may not be on Core Team, and a Worship admin should not get People and Send just because they admin Worship.

**Groups, not 130 ticks (Martin: "we do need to be able to set groups though so we dont have to individual tick 130 profiles"):**
- **Most people need nothing ticked.** "Me and my family" and their own team spaces already come from the teams they're on. Only admin-type access is chosen.
- **Access is set on a group, and people are put in the group.** Use the **teams-as-data** design (APP-A1, the `teams` collection): a group is a team with `rota: false`, like Elders, Finance and Safeguarding. Add one field to a team or group: **`runs: ['today','people','bookings','send']`**, the Running things tabs its members see.
  - Start with **"Church office"** (all four) and **"Bookings"** (Bookings only). The office can add more groups and change what a group sees in one place, and everyone in it changes at once.
  - A rota team can carry `runs` too if Martin wants (e.g. Core Team → Today), but **nothing is given by default**. Core Team and "Admin for" don't give Running things on their own (the church admin may not be Core).
- **One-off extras:** a person can also have individual ticks (`runs` on their address-book record) for the odd exception. What they see is **their groups' tabs plus their own ticks**.
- The person sees **Running things only if that adds up to at least one tab**, and only those tabs. The master admin sees all four.
- **Bookings:** anyone named as a site's bookings admin (`bookingsAdmins`, events window) also gets the Bookings tab automatically.
- **The computer Menu follows the same answer** for the same things (address book, Email Builder, notices, bookings admin), so phone and computer never disagree. One helper in `egbc-auth.js` (e.g. `runsTabs()`) gives the answer and both use it; view-as honours it.
- **A tab someone sees must actually work.** If the page behind it would need a rules change to open for them, say so and stop. Don't loosen a rule quietly.
- **Who can change it:** the master admin sets what a group sees. Putting people into groups is done in the address book, the way team ticks are today.
- Tests: a "Bookings" group member sees one tab; a Worship admin in no group sees no Running things; the church admin who isn't Core but is in "Church office" sees all four; a change to the group's `runs` changes every member; an individual extra tick adds to the group; view-as follows it.
- **Depends on teams as data.** If that hasn't been built yet, build the `teams` collection read first (APP-A1 steps 1–2), then this.

## 21. Who is who: Attender, Church member, Team member (Martin, 9 Oct 2026)

Martin approved these levels. They answer the events window's F-103, where a signed-in person on no rota team was "pending" and looked like a visitor to small groups.

| Level | Who | Gets |
|---|---|---|
| **Pending** | signed in, not in the address book | almost nothing until the office adds them |
| **Attender** | anyone **in the address book** | their own dashboard, small groups, events and sign-ups, the rota, open meetings, Book a room, Resources |
| **Church member** | an Attender the office has ticked **"Church member"** (formally joined the church; not every attender) | everything an Attender gets, **plus members-only**: members' meetings (e.g. the **CMM** room), members-only documents and notices, later voting |
| **Team member** | on a rota team | their team's pages on top, as now; admins as now |

Rules and how it fits:
- **The address book stays the one switch.** A record that matches the person's verified email makes them an Attender, and the "Church member" tick on that record makes them a Church member. Mirror both onto `users/{uid}` the same checked way `teams` is mirrored today, so the rules can test `isAttender()` and `isChurchMember()`. The person can never grant either to themselves.
- `status` becomes `active` for Attenders too, not only for people on a team. Check every rule that used `active()` to mean "volunteer": anything meant for volunteers only must test the team, not `active()`. List each one in the report.
- **The address book "Church member" tick:** office or admins only, shown on `addressbook.html` without changing the page's existing structure (§15). It's an added field.
- **Members-only things don't appear** for Attenders, with no locked door. The Menu, What's on and Meet hide them.
- **Meetings:** the CMM video room becomes Church members only. Others stay as now.
- Do this together with the address book privacy fix (`6398f6bb`), since both change who can read the address book.

**For the events window** (passed on separately): every event, form and group gets "Who can come": Everyone (public), Attenders, Church members only, or a team. The rules enforce it with the new `isAttender()` and `isChurchMember()` once the main window has added them. F-103 is resolved by this: an Attender is not a visitor.

## 20. ChurchShow, and calling a parent three ways (Martin, 9 Oct 2026)

**ChurchShow** (the projection app) is now in its own private repo, `Esherchurch/churchshow`, worked on by a third Code window from `CHURCHSHOW-BRIEF.md`.

**Launch blocker, for Step Q.** ChurchShow reads `services`, `songs`, `addressBook` and `events` through the Firestore REST API with the web key and **no sign-in**. Once the locked rules are deployed at switch-over, all four are refused. ChurchShow's CS1 is establishing a sign-in, probably **pairing the projection PC from the hub**: a "Connect ChurchShow" page, a small function in codebase "hub" that issues a custom token for a device uid, and read-only rules for that device. The hub side of that will come to you as a request. Put "ChurchShow signed in and reading on the locked rules" on the Q checklist now.

**Calling a parent: Martin wants all three ways.**
1. On the service screen through ChurchShow: the events window's `screenPages`, showing the code only. Before launch.
2. Tap to ring the parent. Exists.
3. **A notification on the parent's phone** through the hub app. This is the first real use of the Notify step (SHARE-NOTIFY-BRIEF, F then K). It stays after launch unless Martin brings it forward, but design Notify so "a leader pages a parent" is its first message type: one parent, one message, from the leader screen.

## 19. "Powered by Church HQ" (Martin, 8 Oct 2026)

The product is called **Church HQ** (churchhq.co.uk). EGBC is its first church. **Members still see "EGBC Hub"**: the church's own name and logo stay the brand, and every future church gets the same. Church HQ appears only as a small, quiet credit.

The brand kit is in `v2/brand/church-hq/` (from Martin's OneDrive). See its README for the rules: light version on light backgrounds, never recolour the cross, never stretch the mark.

**One small line, in three places only:** the doorway mark (`svg/mark-light.svg`, about 16px high) followed by "Powered by Church HQ" in 12px muted text (#6b7280), centred, linking to https://churchhq.co.uk in a new tab:
1. **The sign-in page** (`login.html`), under the sign-in box. **Main window.**
2. **The bottom of the Menu** (the shell's Menu panel, so every page, and the hub's), under the last item. **Main window.**
3. **The public hire pages**: the footer of `hire.html`, `room.html`, `book.html` and `my-booking.html`. **Events window.** The closed-set test must still pass, so add churchhq.co.uk as the one allowed outside link.

Rules:
- Never replace or sit beside the church's own logo in a header. Never on emails or PDFs. Nowhere else.
- One shared snippet (`egbc-poweredby.js`, made by the main window, with `EGBCPoweredBy.html()` returning the markup) so the three places can't drift. The events window uses it once it exists.
- The page shows the credit even if the image fails to load.
- Prove it with screenshots of each place at phone width.

## 18. Step R: people choose which calendar feed (Martin, 8 Oct 2026)

Martin: *"we need to let them choose. for example we need a feed for the whole family, or for the full rota if they prefer. Karen as an example needs to know if Oliver is on."*

This adds to `ROTA-CALENDAR.md` and §11. Each person can have **any or all** of these feeds, each with its own private link and its own "Reset this link":

1. **Just me.** The events I'm on. This is the design already built.
2. **My household.** Every event anyone in my household is on. The household is the same one the household PDF uses (`EGBCRotaPdf.householdIds`, following the links both ways).
   - Each calendar entry says who, e.g. **"Oliver: Drums · Karen: Session Leader, Sunday Morning Worship"**.
   - The description lists every household member's role that day.
3. **The full rota.** Every service, with the whole team in the description. Offer a choice of team: **Worship & AV**, **Kids Church**, or **Everything**.
   - It may only include the teams that person is allowed to see on the read-only rota. Use the same `visibleRoles` rule `view-only-rota.html` uses, so a feed never shows more than the page does.

On the hub's "My rota", show the three choices in plain words, each with:
- **Add to my calendar**, with links for Google, Apple/iPhone and Outlook
- **Copy link**
- **Reset this link**, which explains that the old link stops working and anything already in their calendar stays until they remove it

Rules:
- Each feed's link carries its own long random key, stored so only that person can read it. Resetting one feed's key doesn't touch the others.
- The **household** feed is worked out when the calendar app asks, not when the link was made. If someone joins or leaves the household, the feed follows.
- The feeds hold times, roles, the service and names, and nothing else: no emails, phone numbers or notes.
- On the emulator with synthetic data, prove:
  - Karen's household feed contains Oliver's drums date
  - her "Just me" feed doesn't
  - a Worship member's full-rota feed doesn't contain a Kids Church team they can't see
  - resetting the household link stops it working, and leaves "Just me" working

Fold this into Step R and finish it. Report with Martin's deploy steps; nothing deployed.

**Next server step, after Step R is accepted: booking reminders (Martin, 8 Oct 2026: "just dont forget it").** Send "your booking is tomorrow" emails for room bookings (events window F-072b). They need a scheduled Cloud Function in the same `v2/functions/` codebase "hub", deployed only with `--only functions:hub`. The events window owns the booking data and writes the spec in `FINDINGS-events.md`; the main window builds the function. Do it as its own small step so Martin deploys the server once for both, or as close to that as possible.

## 17. Step N2: the hub's home on one screen, and no more link to the portal copy (Martin, 8 Oct 2026)

Do this after Step N and before Step R.

### a. No link to the portal copy
Martin: *"why does it still link to the old site? There is nothing on there that wont be on the new one so we dont need that."*
- Remove "Worship & AV Hub" (`EGBCWorship&AV.html`) from the hub sidebar, the Menu, "Where to?" and the registry, so nothing in v2 links to it. Don't delete the file.
- **First prove the hub does everything that page does.**
  - **News stays separate (Martin's correction):** the original portal keeps its news in `portal/dashboardContent`, and the hub uses the `news` collection. That's fine. Only Martin uses v2 before launch, so news is posted on the original, and after switch-over it's posted on the hub. **Do not** make the hub read the portal's news.
  - The hub's news must do everything the portal's news panel does, including what S2c restored. Today it has no **"show until"**. Check and fill: add, edit, manage the list, remove, "show until", paste from an email with the `<style>` strip, and a failed save that says so.
  - The hub's existing "bring old notices across" stays available for switch-over day.
  - Check every other feature of `EGBCWorship&AV.html` against the hub. List each one and where it now lives in the hub.

### b. The home page fits on one screen
Martin: *"this needs to see everything in one. you have to scroll quite a way down to see the team charter. The widgets can be smaller. Maybe make the latest news a pop out rather than fixed if that frees up page real estate?"*

Today at 1920×945 the page is 1831px tall. My serving starts at 308px and the Core Team Charter at 1212px.

- **Target:** at 1440×900 and 1920×1080, everything on the home page is visible without scrolling. At phone width, the order is: My serving, Meetings, Pin board, Charter.
- **Banner:** much shorter, about 100px.
- **Latest news becomes a pop-out:** a "Latest" button in the hub's top bar with a count of unread items, which opens a panel from the right. Its column is freed for the widgets.
- **Compact widgets:**
  - My serving shows the next 3 with "The whole rota".
  - Video meetings is a single row unless one is coming up.
  - The pin board shows its newest 3.
- **The team charter** is a compact card: the title and its section headings (e.g. "Our Identity & How We Carry Ourselves"). Each heading opens its section. Nothing is lost; it is folded.
- Structure rule (§15): nothing is removed from the home page. It is made smaller or folded.

Prove it:
- screenshots at 1440×900, 1920×1080 and 375px wide
- a check that measures the page height at 1440×900 and fails if anything on the home page is below the fold
- the news shown and managed from the hub on the same synthetic data the original reads

Stop and report.

## 16. Step N: the Menu matches the original portal (before Step R)

Martin was confused by v2's Menu. The full audit is in `NAV-AUDIT.md`: the original portal's two views (normal, and Core Team via `?role=core`), v2's Menu today, and the links that leave v2. Martin approved this Menu on 8 Oct 2026. Build it exactly.

```
Dashboard                                  (the hub)
Rota                                       view-only-rota.html
Meetings                         new       meeting.html
What's on                        new       whatson.html
Worship & AV                               Worshipteamcharter.html
    Worship
        Play-Through                       EGBC-PlayThrough.html
        Worship Training                   EGBC-Training-Worship.html
        Music Databases
            Music Database                 Library.html
            Music Uploader                 batchupload.html
    AV
        How-To AV                          EGBC-HowTo-AV.html
        AV Troubleshoot                    EGBC-Troubleshoot-AV.html
        Equipment
            Inventory                      inventory-system-2.html
            AV Infrastructure Mapper       schematic.html
            Monitor Setup                  MonitorStageMap.html
Youth                                      Youthcharter.html
    Youth Service Planner                  youthserviceplanner.html
Core Team             (Core Team only)     Coreteamcharter.html
    Planning
        Rota Planner                       Planner.html
        Sunday Service Planner             SundayServicePlanner.html
        Availability form                  index.html
    People and email
        Address Book                       addressbook.html
        Email Compiler                     EmailBuilder2.html
    Music
        Music Upload                       music-uploader.html
    Events and rooms  (admins only)
        Events                             events-admin.html
        Places                             places-admin.html
    Admin             (admins only)
        Backup & Restore                   data-tools.html
Resources
    Idea's pin board                       stickynotes.html
    Apps and downloads                     hubresources.html
    Team Resources            new          resources.html
    Team Videos               new          videos.html
```

Rules:
- **Names, order and headings exactly as above.** A heading that is also a page (Worship & AV, Youth, Core Team) opens its charter, as on the original.
- **Who sees what comes from the login, not a link.** Core Team sees the Core Team section. Admins of the relevant team see "Events and rooms" and "Admin". A heading with nothing visible under it is hidden.
- **Remove** the "Apps" group from the Menu. "Add to your phone" is explained on Apps and downloads.
- **Remove** `sundayplannersonglibrary.html` and `song-summary.html` from the Menu; they open from inside the Sunday Service Planner.
- **Remove** the label "Worship & AV Hub (old)" from the hub sidebar. It is a v2 page.
- Leave out the original's empty "Worship Leaders" and "Heart and Direction" headings.
- The hub's own sidebar and "Where to?" list follow the same structure and the same visibility rules. One structure, not two.
- The events window's requests for new events pages (F-031) go in this structure. Check-in, Registers and Safeguarding go under **Events and rooms**. "Report a concern" goes under **Resources**, for everyone.

**Pin board shortcut on the landing page.** Martin: *"It is actually important but buried."* Add a **"Pin board"** card to the hub's home (the "My EGBC" dashboard) for everyone signed in. It shows:
- the newest 3 to 5 notes, title or first line and who added it
- **"Add an idea"**, which opens the pin board ready to add
- **"Open the pin board"**

It reads the same data `stickynotes.html` uses, and changes nothing about the pin board itself.

**The 44 links that leave v2** (NAV-AUDIT §3): make every in-page link relative so it stays in v2. Links inside **emails** need a full address. Point those at the v2 page and say in the report which ones they are; the original site's own emails are untouched.

Prove it:
- screenshots of the Menu as a Worship member, as Core Team, and as a master admin
- the pin board card on the hub at phone and desktop width
- a check that fails if any v2 page links to the original site outside an email

**Added by Martin, 8 Oct 2026:**
- "Hire our rooms" (`hire.html`), for everyone, under "What's on".
- "Book a room" (the members' booking page), for everyone, directly under "Hire our rooms".
- "Room bookings" (the office page) under Core Team, then Events and rooms, for admins and each site's bookings admins.

Stop and report, then go on to Step R.

## 15. Martin found lost behaviour — S2 is now a side-by-side comparison of every page

**What Martin found.** On v2, the Sunday Service Planner opens with an **empty Order of Service**. The original opens with the church's fixed layout: Opening Remarks, 3 songs, Welcome and Notices, a song, Message, 3 songs, Closing Remarks. Martin's words: *"You cannot lose functionality … It will be hugely problematic if you do."*

**Cause (found by the reviewing window).** In Step B the page's module got `await ready;` at the top. `window.onload = async () => { … setupDefaultOrder(); … }` is assigned *after* that await. By the time sign-in has been restored, the load event has usually already fired, so the handler never runs. That one handler does four things, and all four are lost:
- the default order (`setupDefaultOrder`)
- drag-to-reorder (`Sortable.create`)
- the textarea auto-fit
- the address book that fills the names list

The parity audit compared source, so it saw the function was still there and called it "not missing".

**The same bug is in `youthserviceplanner.html`** (line ~289). No other page has `window.onload` or `DOMContentLoaded` after `await ready`. Check that claim yourself.

### S2 replaces the earlier S2 wording. Do it in this order

**S2a: fix the two pages now.** Run the start-up code whether or not the load event has already happened. For example: `if (document.readyState === 'complete') start(); else window.addEventListener('load', start);`. Prove it on each page:
- the default order appears exactly as the original, item by item and in order
- dragging reorders
- the names list is filled

Deliberate break: put the old assignment back, and show your test catches the empty order.

**S2b: a static check for the whole class.** Add a check that fails if any page registers a `load` / `DOMContentLoaded` / `window.onload` / `<body onload>` handler that can only run after a top-level `await`. Run it across all of `v2/`.

**S2c: every page, side by side with the original.** For **every** page that exists in both places (all 51):
1. Load the original page (repo root) and the v2 page against **the same synthetic emulator data**. You can serve the root pages on localhost so they also hit the emulator. Check that first, and if a root page can't be pointed at the emulator, say so; don't touch live data.
2. On both, open every screen, tab, sheet and modal, as in A3b. At each state compare the following, and list every difference:
   - **what appears without anyone touching anything:** default items and their order, prefilled fields, default selections, lists that fill themselves, the date it opens on
   - **every control:** what's there, what each one does
   - **what each main action writes or produces:** the saved document's fields, the email's subject, recipients and attachments in the outbox, the PDF's pages, the export's columns
3. Every difference must be one of: **(a)** a deliberate, agreed change (name the step and the decision), **(b)** a restyle-only change (same structure, same order, same wording apart from case), or **(c)** a loss. **Every (c) is fixed** in this step, with a proof against the original.
4. The **Rota Planner** (`Planner.html`), the **Sunday Service Planner**, the **availability form** and **login** go first.

**Structure is never a restyle choice.** The order of items, which items appear by default, the sections of a page, the columns of a table and the fields of a form stay exactly as the original. The restyle changes how things look, never what is there or in what order. If you think a structural change is right, write it in FINDINGS for Martin and leave it as it was.

The report gives a per-page table: states compared, differences found, how many are (a), (b) and (c), and (c) fixed. It includes side-by-side screenshots for the four first pages. Stop after S2.

## 14. A second window now builds events (from 7 Oct 2026)

Martin has opened a second Code window for the post-launch events work. Its rules are in `EVENTS-WINDOW-BRIEF.md`. What this means for you, the main window:

- **It owns** `events-admin.html`, `signup.html`, `my-signup.html`, `whatson.html`, `places-admin.html`, `egbc-events.js` and `FINDINGS-events.md`, plus any new events files. Don't edit these. If one of your steps needs a change there, write it in your report instead.
- **It edits the rules only inside a marked events section.** Keep your own rule changes outside that section. Both rules suites must stay fully green for both windows.
- **Its first step (E0) changes `egbc-auth.js` and `egbc-db.js`** so pages served from localhost:5601 use its own emulator ports (8182, 9098, 9198). Your ports and behaviour don't change. Pull before you touch either file.
- **It sends you requests** for shared files (hub tiles, the dashboard, the shell) through `FINDINGS-events.md`. Martin passes on the ones he wants.
- Commits from that window start with `Events:`.
- Always run `git pull --rebase` before a push. If a rebase clashes on a file you don't own, stop and report.

## 3. Order of work across the three briefs (superseded by §12)

One step at a time. Stop and report after each. Pull before each step; commit small; push often.

| Step | Work | Brief |
|---|---|---|
| ~~A~~ | ~~Restyle Group 1, first pass~~ — **done (9a82f685)** (engine into `egbc-ui.js`, emoji, team colours, cards, phone overflow, view-as strip, main-action proof) | RESTYLE + this file |
| ~~B1~~ | ~~Settle A-005~~ — done (40eb2041) | this file |
| ~~V~~ | ~~No SharePoint in v2~~ — done (363aa80f); videos moved by Martin's window |
| (was V) | **No SharePoint in v2** — four knowledge-base pages onto Firebase, training portal link removed (§7) | this file |
| ~~B~~ | ~~One app — Chunk 1~~ — done (4b6c375e), gate reads 0 |
| (was B) | **One app — Chunk 1:** every in-scope page onto the one signed-in connection — **the five live-writing pages first** (§0, §5) | ONE-APP |
| ~~A2~~ | ~~Finish Restyle Group 1: cards and lists~~ — done (2998c851) | RESTYLE |
| ~~C~~ | ~~Events — Chunk 2~~ — done (2fd48116) | EVENTS |
| D | One app — Chunk 2: EGBC Hub as the main app, companions, Meet tab, real-phone tests | ONE-APP |
| A3 | **Controls and emoji on Group 1** (R-012, R-013) | RESTYLE |
| E | **Share — Chunk 1:** Share to WhatsApp on notices and meetings (events join when built) | SHARE-NOTIFY |
| F | **Notify — Chunk 1:** establish how notifications can be sent; write Martin's manual steps; **stop before building** | SHARE-NOTIFY |
| R | **Live calendars:** per-person rota feed and the events feed, one Cloud Function in `v2/functions/` (§11) | this file |
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
