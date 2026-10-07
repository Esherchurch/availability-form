# The events window — how to work alongside the main window

Written 7 October 2026 for a **second** Claude Code window, building events features in parallel with the main window. Martin writes no code: the briefs are the spec, you build, he assesses, and his reviewing window checks every report against the code.

Read in this order: this file, then `EVENTS-BOOKINGS-BRIEF.md` (the spec: §6 features, §7 technical rules, §9 chunks), then `NEXT-BRIEF.md` §0 (safety), §4 (standing rules), §11 (upload links) and §12 (the launch line), then `DESIGN.md`.

**This file wins over the others where they conflict, but only about how the two windows share the repo.** What to build is still `EVENTS-BOOKINGS-BRIEF.md`.

---

## 1. Why there are two windows

- **The main window** works down the launch list in `NEXT-BRIEF.md` §12: parity, the live rota calendar, the restyle groups, the email lock and the launch checklist.
- **You** build the features that come after launch, starting with Events Chunk 3, so they're ready sooner without slowing launch down.

v2 hasn't launched, so what you push to `main` is not in front of the church. It must still never break a page the main window is working on.

## 2. The ground you own, and the ground you don't

**Yours** (edit freely):
- `events-admin.html`, `signup.html`, `my-signup.html`, `whatson.html`, `places-admin.html`, `egbc-events.js`, `FINDINGS-events.md`.
- Any **new** page or file you make for events. Name new shared modules `egbc-events-*.js` or similar, so the owner is obvious.
- Your own tests and screenshots under `v2/screenshots/events/`.

**Shared, with care:**
- `firestore.rules`, `storage.rules`, `firestore-rules.test.mjs`, `storage-rules.test.mjs` and `firestore.indexes.json`.
  - Edit **only inside a clearly marked events section**, e.g. `// ── EVENTS (events window) ──` … `// ── end EVENTS ──`. Add one if it's not there.
  - Never change a rule outside it.
  - Both rules suites must pass in full before every push, not just your tests.

**Not yours.** Don't edit these. If you need a change, write it in `FINDINGS-events.md` as a request for the main window, and Martin will pass it on:
- `egbc-auth.js`, `egbc-db.js`, `egbc-shell.js`, `egbc-ui.js`, `egbc-email.js`, `egbc-nosend.js`, `egbc-guard.js`
- `hub.html`, `hub-app.js`
- the manifests and `sw.js`
- `NEXT-BRIEF.md`, `ONE-APP-BRIEF.md`, `RESTYLE-BRIEF.md`, `SHARE-NOTIFY-BRIEF.md`, `DESIGN.md`
- `firebase.json`
- any page not listed under "Yours"

The **one exception** is Step E0 below.

**Never anything outside `v2/`.**

## 3. Working copy, emulators and GitHub

- **Your own folder:** clone fresh to `C:\Users\marti\egbc-events`. Never work in the main window's folder or in Martin's Downloads copy.
- **Your own emulators**, so the two windows' test data never meet. The main window uses Firestore 8181, Auth 9099, Storage 9199 and UI 4000. Yours are **Firestore 8182, Auth 9098, Storage 9198, UI 4001**, set in your own `firebase.events.json`, started with `firebase emulators:start --config firebase.events.json`. Serve your pages on **localhost:5601**. See E0 for how the pages find your ports.
- **GitHub:** run `git pull --rebase` before every push, and push small and often. If a rebase clashes on a file you don't own, stop and report; don't resolve it in your favour.
- **Commits** start with `Events:` so the history shows which window made them.

## 4. Safety (same as the main window, no exceptions)

- Synthetic data only, never real people. Prove you're on the emulator before any write.
- No email leaves the machine. `egbc-nosend.js` already holds every send on localhost; check the outbox, not an inbox.
- Never deploy rules, indexes or functions. Martin deploys, and storage and Firestore rules only at switch-over.
- Never delete live data. Never retire an app or change a manifest's `id`, `start_url` or `scope`.
- Photos may show children: nothing a guest uploads is shown anywhere until an admin approves it.

## 5. Steps — one at a time, stop and report after each

### E0 — your own emulator ports (the only shared-file change you make)
Today `egbc-auth.js` (around line 74) and `egbc-db.js` (around line 100) hard-wire 8181, 9099 and 9199.
- Change both so that **a page served from localhost:5601 uses 8182, 9098 and 9198**. Every other localhost port keeps exactly today's ports, so the main window sees no change at all.
- Add `firebase.events.json` (a copy of `firebase.json` with your ports).
- Let the two rules test files take their ports from an environment variable, defaulting to today's.
- Prove it: run both emulator sets at once, write a synthetic record on 5601, and show it is **absent** from 8181.
- Deliberate break: serve on 5601 with the change removed, and show the record lands in the main window's emulator.
- Pull first, make it one small commit, and push it before anything else so the main window picks it up.

### E1 — Chunk 3, stage 1: QR check-in and attendance
`EVENTS-BOOKINGS-BRIEF.md` §9 Chunk 3 and the matching parts of §6:
- QR check-in and check-out, collectors, headcount and roll-call.
- Registers and downloads (CSV, Excel, PDF), and series attendance.

### E2 — Chunk 3, stage 2: forms and consent
Forms builder and templates, reusable consent with expiry, and chasing incomplete forms.

### E3 — Chunk 3, stage 3: safeguarding
Ratios, leader checks, incident log, concern reporting, sensitive-data rules and the retention list. Who can see what goes in the rules, with tests, not in the page.

### E4 — one-off upload links
`NEXT-BRIEF.md` §11: `uploadLinks`, `upload.html`, the storage rule, the admin review queue, and the deliberate breaks listed there.

After E4, stop. Chunks 4 and 5 (room bookings, then hire and charges) come next, once Martin says so.

## 6. Things that aren't built yet — leave a gap, don't build them

- **Share to WhatsApp** (main window, after launch): put a plain "Copy link" where a share button will go, and note the spot in `FINDINGS-events.md`.
- **Notifications** (after launch): no push code. Email only, through `egbc-email.js`.
- **The member dashboard and hub tiles** (`hub-app.js`, main window): don't add events to the hub yourself. Write what the hub should show in `FINDINGS-events.md`.
- **The events calendar feed** (after launch, with the server step).

## 7. Each report

The five things in `EVENTS-BOOKINGS-BRIEF.md` §9 ("Each gate report"), plus:
- Every file you changed that you don't own (E0 only, or the marked rules sections), and why.
- Proof the main window's tests still pass: both rules suites in full, and the 32-page smoke test.
- `git diff` shows nothing outside `v2/`.
