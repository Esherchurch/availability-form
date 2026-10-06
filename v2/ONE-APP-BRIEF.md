# EGBC Hub and its phone apps — one sign-in — build brief

For a Claude Code window working in `Esherchurch/availability-form`, **`v2/` only**.
Written 2026-10-06. Martin writes no code: this brief is the spec, you build, he assesses.

**Chunk 1 only, then stop and report (§8).**

---

## 1. What we are building, in one sentence

Give **the EGBC Hub and its companion phone apps one sign-in and one way of working**, so members and admins use the same apps with the same login and admin tools simply appear for the people allowed them — the opposite of ChurchSuite, where creating an event means switching to a different app and a different login.

## 2. What we are NOT doing

- **Not touching the original site** (everything outside `v2/`). It stays live and unchanged until Martin launches v2. No redirects, no edits, no shared files changed outside `v2/`.
- **No app is retired, merged or removed — ever, in any step.** Every phone app that exists today keeps working, in `v2/` and on the original site. For each app's manifest: **never change `id`, `start_url` or `scope`**, and never delete the manifest or its start page — that would break the app on phones where it is already installed. The only manifest changes allowed are those a brief names (e.g. the display name), and **app names change only after Martin approves each one**.
- **Not merging or retiring the companion phone apps.** They are deliberate: each is focused on one job and installed alongside the hub (list in §4). Keep every one of them.
- Not migrating content (videos etc.) — Martin does that; this build gives him a checklist (§7), not a migration.
- Not building events, bookings, kids or groups — that is `v2/EVENTS-BOOKINGS-BRIEF.md`. This brief makes the app those features live in.
- Not deploying Firestore rules. Martin deploys, after you show the emulator tests passing.

## 3. Decisions already made by Martin

| Question | Decision |
|---|---|
| Scope | v2 only. v2 is not launched; it must be right before launch. |
| App names on phones | The hub is **EGBC Hub**. The companion apps keep their own names, without the "v2" suffix at launch (Martin to confirm each name). |
| Member directory | **Opt-in per person.** Only people who choose to be listed appear, and each chooses what is shown (phone, email, address). |
| Sign-in | One sign-in for everything (email link or Google, as `login.html` does now). Youth keep parent-issued codes but land in the same apps. Guests (event sign-ups, hirers) never need an account. |

## 4. What is there now (checked 2026-10-06 — re-check before relying on it)

- `v2/egbc-auth.js` signs people in on a **named Firebase app, `egbc`** (compat SDK 10.12.2), and exposes `EGBCAuth.db`, `EGBCAuth.storage()`, `EGBCAuth.require()`, roles and teams. Its comments explain why it is named: pages that called `initializeApp` on the default app clashed with it.
- **About 40 v2 pages also start their own, separate Firebase app** for their data: 29 with the compat SDK (`firebase.initializeApp`), 11 with the modular SDK (`import … firebase-app.js`, 10.7.1). Firebase keeps sign-in **per app**, so these pages' data calls go out **not signed in**, even though the page itself checked the login. They work today only because the rules allow it. **This is the "different realms" problem inside our own app, and it blocks deploying `firestore.rules`.**
- `v2/` has phone apps, one manifest each, all **deliberate and staying**. **In scope for this brief** — the hub and its six companion apps:

  | Manifest | Name on phone now | Opens |
  |---|---|---|
  | manifest-hub.json | Team Hub v2 | hub.html |
  | manifest-coreteam.json | Core Team v2 | CoreTeamApp.html |
  | manifest-youth.json | Youth Hub v2 | youthapp2.html |
  | manifest-planner.json | Rota Planner v2 | Planner.html |
  | manifest-service.json | Service Planner v2 | SundayServicePlanner.html |
  | manifest-youthservice.json | Youth Planner v2 | youthserviceplanner.html |
  | manifest-availability.json | Availability v2 | index.html |

  **Out of scope — do not touch at all**, not their pages, manifests, sign-in or look: **Worship Hub** (`worshiphubapp.html`, `manifest-worship.json`), **Mix Builder** (`mix-builder.html` and the `mix-*` files, `manifest-mix.json`), **Calla Design** (`studio.html`, `manifest-studio.json`). Leave them out of every count, test and checklist in this brief.
- The bar and menu on every page come from `v2/egbc-shell.js`; the look from `v2/DESIGN.md`, `egbc-ui.js`, `egbc-editor.js`.
- Rules are tested in the emulator with `v2/firestore-rules.test.mjs` (`v2/firebase.json`, Firestore on 8181).

## 5. Shape of the app

**The hub and its companion apps.** `hub.html` is the main app (**EGBC Hub**). The six companion apps in §4 stay as they are — each focused on one job — and work **alongside** it:
- **Same sign-in in every app.** One login, one person, one set of roles. Signing in once on a device should cover every app on that device where the platform allows it. **Establish on a real iPhone and a real Android phone** whether apps installed to the home screen share the sign-in or each need signing in once; record the answer in FINDINGS. If each needs its own first sign-in, make that one tap ("Continue as Martin" / email link) rather than a fresh form, and say so in the report — do not try to work around the platform.
- **Moving between apps:** every app has the bar's Hub button and Menu; the Menu lists the six companion apps under an "Apps" heading so people can jump between them.
- **Consistent look:** every app follows `DESIGN.md`.

**Navigation inside the hub** (in `hub.html` / `hub-app.js`; companion apps keep their own focused layouts):
- Phone: a **bottom tab bar** — Home · Calendar · Meet · My serving · More (Groups sits under More until it is built). Tabs whose pages do not exist yet are hidden, not dead.
- Computer: a **left sidebar** with the same items, then the person's admin sections.
- The existing Menu (search all pages) stays.

**Home is personal ("My EGBC")** — everyone who signs in lands on **their own dashboard**, in the same app and with the same login as the admin tools (the thing ChurchSuite splits into a separate "My ChurchSuite" with its own login). Each card shows only when it has something in it, and only to that person:

1. **Waiting for you** (top, Must): one list of things that need the person — rota dates to accept or decline, swap requests, forms to complete (consent, safeguarding declarations), notices to confirm as read, bookings needing their approval (bookings admins), sign-ups needing payment. Each item opens the place to deal with it.
2. **My serving** (Must, Chunk 2): next serving dates from the rota (`events` assignments matching the signed-in person's `memberId`) with role, time and "can't do it" → unavailability; link to the full rota. Household members' dates too, where the rota already links households.
3. **My meetings** (Must, already on the hub).
4. **Pinned notices and Latest** (keep the scrolling notices).
5. **My events** (when events exist): what I've signed up to, with cancel (if the event allows it) and add-to-calendar; featured events I might like.
6. **My bookings** (when bookings exist): rooms I've booked or requested, with status.
7. **My children** (when kids registration exists): their groups, this Sunday's check-in, consent forms due.
8. **My groups** (when small groups exist): my groups and their next meeting.
9. **My details**: profile and household, directory choices (Chunk 3).

Rules: build the cards for what exists now (1–4, 9) and leave a clear slot for the rest, filled by the events brief as each chunk lands — **one dashboard, not a second page per feature**. Leaders see the same dashboard plus their admin sections; nobody needs a different login to do either. Never show another person's details here.

**Meet — video meetings are part of the app**, not a page off to the side:
- The **Meet** tab opens `meeting.html` (the list of your meetings, every room, and New meeting). It already uses the shared sign-in, `DESIGN.md` and the Daily.co rooms; reuse it, do not build a second meetings page.
- **Calls stay inside the installed app.** `meeting.html` is inside the hub's manifest scope, so Join should open in the app window, not a browser. **Test camera, microphone, screen share and leaving/rejoining on a real iPhone and a real Android phone** with the hub installed to the home screen; record what works in FINDINGS. If a platform will not allow the call inside an installed web app, fall back to opening the room in the browser with one tap, and say so in the report.
- **One list of meetings.** Today meetings come from the rota (`events` with a `videoRoom`). When the events module from `EVENTS-BOOKINGS-BRIEF.md` exists, its online events (the `online` room kind with a `videoRoom`) must appear in the **same** Meet list and the same "My meetings" card, and **New meeting** should create them there. Until then, leave the rota route working. Never two separate meeting lists.
- **Companion apps:** Core Team already has a Meetings screen — keep it, and make its Join open `meeting.html`. The other companion apps reach Meet from the Menu's "Apps" heading. Every Join button in every in-scope app opens `meeting.html`.
- Host links (`?t=`) must keep working inside the app. They are never stored or written into the repo.
- Later chunks of the events brief add: my sign-ups, my bookings, my children's check-in, my groups.

**Role-based, not realm-based:** leaders and admins see extra sections in the sidebar / More tab (planners, address book, places and bookings, forms, reports, admin), and admin actions inside any app appear only for those allowed them. Same apps, same login. Use the existing roles in `egbc-auth.js` — do not invent a second permission model.

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
- The hub and the six companion apps (§4) each installed from the home screen on a real iPhone and Android phone, signed in, and its main job done. App names without "v2". A test video call made from inside the installed hub on each phone (camera, microphone, screen share, leave and rejoin).
- Youth access codes tested end to end.
- Backup taken (`data-tools.html`).

## 8. Chunks — do Chunk 1, then stop and report

### Chunk 1 — One sign-in, one data connection
1. **Establish the least-change route** and record it in FINDINGS before changing pages. Two candidates to prove or rule out:
   a. each page uses `EGBCAuth.db` / `EGBCAuth.storage()` instead of its own app (compat pages: mostly a change of handle; modular pages: their calls need rewriting to compat);
   b. modular pages call `initializeApp(sameConfig, 'egbc')` — the **same app name** — so their SDK finds the same signed-in user. **Prove it** (a page signed in once shows `request.auth` in the emulator), or rule it out.
2. Move every in-scope v2 page with its own Firebase app onto the shared sign-in (skip the out-of-scope apps in §4), by the route chosen. One commit per group of pages.
3. Proof: in the emulator **with `firestore.rules` loaded**, sign in as a test member and a test admin and do each page's main action. List each page with pass/fail. Then break it on purpose (put one page back on its own app) and show its check failing.

### Chunk 2 — The hub as the main app, with its companions
`manifest-hub.json` display name changed to **EGBC Hub** (only `name` / `short_name`; `id`, `start_url` and `scope` stay exactly as they are). **Keep the six companion apps and their manifests** (§4; the three out-of-scope apps are not touched); prepare their names without "v2" but do not change them until Martin confirms each name (record the proposed names in FINDINGS). "Apps" heading in the Menu. Same sign-in across apps, tested on real phones (§5). Bottom tab bar and sidebar in the hub, including the **Meet** tab and the real-phone call test (§5). Personal Home (§5). Role-based sections.

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
