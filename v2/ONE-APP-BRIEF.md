# EGBC Hub — one app, one sign-in — build brief

For a Claude Code window working in `Esherchurch/availability-form`, **`v2/` only**.
Written 2026-10-06. Martin writes no code: this brief is the spec, you build, he assesses.

**Chunk 1 only, then stop and report (§8).**

---

## 1. What we are building, in one sentence

Turn v2 into **one installable app, "EGBC Hub", with one sign-in**, where members and admins use the same app and admin tools simply appear for the people allowed them — the opposite of ChurchSuite, where creating an event means switching to a different app and a different login.

## 2. What we are NOT doing

- **Not touching the original site** (everything outside `v2/`). It stays live and unchanged until Martin launches v2. No redirects, no edits, no shared files changed outside `v2/`.
- Not migrating content (videos etc.) — Martin does that; this build gives him a checklist (§7), not a migration.
- Not building events, bookings, kids or groups — that is `v2/EVENTS-BOOKINGS-BRIEF.md`. This brief makes the app those features live in.
- Not deploying Firestore rules. Martin deploys, after you show the emulator tests passing.

## 3. Decisions already made by Martin

| Question | Decision |
|---|---|
| Scope | v2 only. v2 is not launched; it must be right before launch. |
| App name on phones | **EGBC Hub** |
| Member directory | **Opt-in per person.** Only people who choose to be listed appear, and each chooses what is shown (phone, email, address). |
| Sign-in | One sign-in for everything (email link or Google, as `login.html` does now). Youth keep parent-issued codes but land in the same app. Guests (event sign-ups, hirers) never need an account. |

## 4. What is there now (checked 2026-10-06 — re-check before relying on it)

- `v2/egbc-auth.js` signs people in on a **named Firebase app, `egbc`** (compat SDK 10.12.2), and exposes `EGBCAuth.db`, `EGBCAuth.storage()`, `EGBCAuth.require()`, roles and teams. Its comments explain why it is named: pages that called `initializeApp` on the default app clashed with it.
- **About 40 v2 pages also start their own, separate Firebase app** for their data: 29 with the compat SDK (`firebase.initializeApp`), 11 with the modular SDK (`import … firebase-app.js`, 10.7.1). Firebase keeps sign-in **per app**, so these pages' data calls go out **not signed in**, even though the page itself checked the login. They work today only because the rules allow it. **This is the "different realms" problem inside our own app, and it blocks deploying `firestore.rules`.**
- `v2/` has **10 manifests** (`manifest-*.json`) — ten separately installable apps. `manifest-hub.json` is named "EGBC Team Hub" / short name "Team Hub v2".
- The bar and menu on every page come from `v2/egbc-shell.js`; the look from `v2/DESIGN.md`, `egbc-ui.js`, `egbc-editor.js`.
- Rules are tested in the emulator with `v2/firestore-rules.test.mjs` (`v2/firebase.json`, Firestore on 8181).

## 5. Shape of the app

**One front door:** `v2/hub.html`, installed once as **EGBC Hub**.

**Navigation** (added to `egbc-shell.js` so every page has it):
- Phone: a **bottom tab bar** — Home · Calendar · My serving · Groups · More. Tabs whose pages do not exist yet are hidden, not dead.
- Computer: a **left sidebar** with the same items, then the person's admin sections.
- The existing Menu (search all pages) stays.

**Home is personal ("My EGBC")**, built from what exists today:
- Pinned notices and Latest (keep the scrolling notices).
- **My next serving dates** from the rota (`events` assignments matching the signed-in person's `memberId`), with a link to the rota.
- **My meetings** (already on the hub).
- Later chunks of the events brief add: my sign-ups, my bookings, my children's check-in, my groups.

**Role-based, not realm-based:** leaders and admins see extra sections in the sidebar / More tab (planners, address book, places and bookings, forms, reports, admin). Same app, same login. Use the existing roles in `egbc-auth.js` — do not invent a second permission model.

**My profile and household** (Chunk 3): a person sees and edits their own details and their household's; changes to name, email or household go to an admin to approve; phone and directory choices save straight away.

**Directory** (Chunk 3): opt-in. A person chooses to be listed and picks which of phone, email, address are visible to signed-in members. Default: not listed. Never visible to guests or youth-code users.

## 6. Rules for the build

- **Synthetic data only.** Develop and test against the emulator with made-up people. Never read, copy or test against the live address book or any real person's record.
- **No change may lock anyone out of v2.** Every page must keep working after each chunk. The original site is not touched at all.
- **Reuse before build:** `egbc-auth.js`, `egbc-shell.js`, `egbc-ui.js`, `egbc-editor.js`, `DESIGN.md`. Name the file you reuse; do not write a second one.
- Every page follows `DESIGN.md` and works on a phone at 375px.
- Ambiguity goes in `v2/FINDINGS-app.md`; take the reading that builds least and carry on. Stop only if you cannot proceed.
- **Coordinate with the events window:** one tree, one branch. Pull before you start each stage, commit small, push often. If both briefs need the same file (`egbc-shell.js`, `hub-app.js`), record it in FINDINGS and keep changes additive.

## 7. Launch checklist (Chunk 4 builds a page that tracks it)

`v2/launch.html`, admins only: a list Martin ticks through, stored in Firestore, showing what is left.
- Every v2 page opens signed in, does its main job, and saves (tick per page — list them from the registry).
- Content moved from the original site: videos, resources, charters, song library, training material (Martin fills in the list).
- Sign-in tested on a real iPhone and a real Android phone, installed from the home screen.
- `firestore.rules` and `storage.rules` deployed and every page re-checked afterwards.
- Old v2 manifests retired (§8 Chunk 2).
- Youth access codes tested end to end.
- Backup taken (`data-tools.html`).

## 8. Chunks — do Chunk 1, then stop and report

### Chunk 1 — One sign-in, one data connection
1. **Establish the least-change route** and record it in FINDINGS before changing pages. Two candidates to prove or rule out:
   a. each page uses `EGBCAuth.db` / `EGBCAuth.storage()` instead of its own app (compat pages: mostly a change of handle; modular pages: their calls need rewriting to compat);
   b. modular pages call `initializeApp(sameConfig, 'egbc')` — the **same app name** — so their SDK finds the same signed-in user. **Prove it** (a page signed in once shows `request.auth` in the emulator), or rule it out.
2. Move **every** v2 page with its own Firebase app onto the shared sign-in, by the route chosen. One commit per group of pages.
3. Proof: in the emulator **with `firestore.rules` loaded**, sign in as a test member and a test admin and do each page's main action. List each page with pass/fail. Then break it on purpose (put one page back on its own app) and show its check failing.

### Chunk 2 — The app shell
One manifest: `manifest-hub.json` renamed **EGBC Hub** (short name "EGBC Hub"), start page `hub.html`. Every v2 page links that manifest; the other nine v2 manifests are retired (pages that were their start pages stay reachable from the menu). Bottom tab bar and sidebar in `egbc-shell.js`. Personal Home (§5). Role-based sections.

### Chunk 3 — Profile, household, directory
§5. Rules tests: a member can edit their own record but not another's; directory fields are visible only when the person opted in, only to signed-in members; youth-code users and guests see none of it. Break each rule and show the test failing.

### Chunk 4 — Launch checklist page
§7.

### Each gate report says five things
1. What was built, as a list of files.
2. Deliberate breaks and which test caught each.
3. The lock-out check: how you proved every v2 page still works, and that nothing outside `v2/` changed (`git diff --stat` limited to `v2/`).
4. Found and not fixed, numbered in `v2/FINDINGS-app.md`.
5. The one proof that matters for that stage, named on its own.

---

Chunk 1 first. Report after it and wait.
