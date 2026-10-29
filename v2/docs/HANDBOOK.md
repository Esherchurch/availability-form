# Church HQ: the developer handbook

This is for a developer who is new to Church HQ. It explains how the system is put together, where things live, and how to change it safely. It is short on purpose: read it once end to end, then use it as a map.

The engineering standards everything should meet are in [ENGINEERING.md](../ENGINEERING.md). This handbook describes the system as it is today. Where today falls short of those standards, it says so.

**First draft, 28 Oct 2026.** Parts of the layout described here will change in the "make it maintainable" stage (ENGINEERING.md §9), when Church HQ moves to its own repository. Those places are marked **(changing)**.

---

## 1. What Church HQ is

Church HQ is a web app that runs a church: the Sunday rota and service plans, the people and teams, events, rooms and bookings, children's check-in, safeguarding, giving, emails and the e-news, video meetings, and the screens in church. People use it in a browser on a computer, or installed on their phone's home screen.

It started as one church's hub, Esher Green Baptist Church (EGBC). It is now built for **any church**: a Church of England parish, a Baptist church or anyone else. EGBC is simply the first church whose data it holds. The test used before anything goes live is a made-up parish, "St Aidan's with St Hild, Testbury". If the parish would see EGBC's name, EGBC's words or EGBC's teams anywhere, that is a bug.

**What it is made of:**

| Part | What it is |
|---|---|
| Pages | Plain HTML pages with their own scripts, and shared scripts (`egbc-*.js`). No framework and no build step: what is in the folder is what the browser loads. |
| Database | Google Cloud Firestore, in one Firebase project (`egbc-worship-planner`). |
| Files | Firebase Storage: pictures, papers, recordings. |
| Server | Cloud Functions for Firebase (Node 22), in `functions/`, in London (`europe-west2`). |
| Security | Firestore and Storage **security rules**. These are what actually protect the data. A page hiding a button is a convenience, never a protection. |
| Email | Church HQ's own Resend account, sent only by the server. |
| Video | Daily.co rooms, made by the server. |
| Hosting | GitHub Pages today; each church's own address (`<church>.churchhq.co.uk`) goes through a Cloudflare Worker in front of the same pages (`tools/cloudflare/`). **(changing)** |

**Where it is today.** The code lives in the `v2/` folder of the original EGBC site's repository (`Esherchurch/availability-form`). The rest of that repository is the original site, which is still in use until EGBC goes live on Church HQ. **Never change anything outside `v2/`.** **(changing: Church HQ moves to its own repository.)**

## 2. How a church's data is kept apart

Several churches share one database, and no church may ever see another's data. This is the most important rule in the system.

**Where the data lives:**
- **Each church's data** is under `churches/<church id>/...`, for example `churches/st-aidans/addressBook/<person>`.
- **EGBC's data** is still at the top level (`addressBook/<person>`), because EGBC was there first and its data has not been moved. To the code, "no church id" means EGBC. A decision record will explain why it stays there for now. **(changing)**
- **Church HQ's own directory** is at the top level too: `hqChurches` (each church), `hqSlugs` (each church's short name for its address) and `hqMemberships`.

**How the code stays inside one church.** Nothing builds a path by hand. Both the pages and the server use a stand-in for the database that adds the church for you:

- **In a page:** `EGBCAuth.db.collection('news')` is `churches/<id>/news` for a church and the top-level `news` for EGBC. The church comes from the address (`st-aidans.churchhq.co.uk`), or on a test from `?church=<id>`. Always use `EGBCAuth.db`. Never call `firebase.firestore()` yourself.
- **In a function:** `churchOf(request, db)` (in `functions/church-scope.js`) gives `{ id, db }`, where `db` is that church's. The church comes from the person's sign-in (their `churches` claim, set by the server), never from anything the page sends. A page may name one of the person's own churches; naming any other is refused.
- **In a trigger:** `churchFromPath(event, db)` reads the church from the document's path. Every trigger is written twice, once for EGBC's path and once for `churches/{cid}/...`. That is why `index.js` exports pairs such as `membersMeetingSync` and `membersMeetingSyncChurch`.
- **In a scheduled job:** `eachChurch(db, fn)` runs the job for EGBC, then for each active church, one at a time. One church failing doesn't stop the others.

**Collection groups are refused** by both stand-ins, because a collection group query reaches every church at once.

**The rules check it too.** There are two rulesets:
- `firestore.rules` is the source everyone edits, for EGBC's top-level data.
- `tools/rules-build.mjs` builds `firestore.build.rules` (comments removed, so it fits Firebase's size limit) and the church ruleset `firestore.churches.rules`, which applies the same rules under `churches/{cid}/`. It does the same for storage (`storage.churches.rules`).
- **Never edit a built file.** Edit `firestore.rules` and run the build.
- `church-rules.test.mjs` is a differential test: it puts the same records in two made-up churches and proves that nobody in one can read or write the other's.

**Things that are one per church:** its settings (`churchSettings/details`, `.../features`, `.../teamJobs`...), its people, its teams and everything else. Its words come from those settings, never from the code: its name, its minister's title, what it calls a member and what it calls the meeting where members vote. In a page, `EGBCAuth.memberWord()`, `ministerTitle()` and `meetingWord()`; on the server, `functions/church-words.js`.

## 3. The folder map

Inside `v2/` today. **(changing: ENGINEERING.md §2 moves these into `pages/`, `js/`, `rules/` and `docs/`.)**

| Where | What |
|---|---|
| `*.html` | The pages, one file each (`hub.html`, `enews.html`, `Planner.html`...). Most still hold their own script inline. |
| `egbc-*.js` | Shared page scripts. Each adds one global: `egbc-auth.js` → `EGBCAuth`, `egbc-menu.js` → `EGBCMenu` and so on. |
| `functions/` | The Cloud Functions. `index.js` exports every function; each area has its own file (`enews.js`, `meetings.js`, `gocardless.js`...). |
| `functions/*.test.mjs` | The functions' tests, run on the emulator. |
| `firestore.rules`, `storage.rules` | The security rules everyone edits. |
| `firestore.build.rules`, `firestore.churches.rules`, `storage.churches.rules` | Built from those by `tools/rules-build.mjs`. Never edit them. |
| `*-rules.test.mjs` (at the top) | The rules tests. |
| `data-map/*.json` | The data map: every collection, its links and its on-delete rule (section 6). |
| `help/<page>.md` | Each page's help, in plain words. The "?" panel and the Ask box read it. |
| `tests/` | Browser and Node checks (`check-*.mjs`), and `run-all.mjs`, which runs them one at a time. |
| `tools/` | Scripts people run by hand: the builders (rules, help, data map, team jobs), set-up and import tools, and one-off fixes against live data. |
| `img/`, `brand/` | Pictures and the logo. |
| `design/`, `design-mocks/` | Mock-ups and design notes. Not code. |
| `*.md` at the top | Briefs and work logs (`FINDINGS-*.md`). **These are history, not documentation**; they move to `docs/history/`. The documents worth reading are this handbook, ENGINEERING.md, GOING-LIVE.md, SERVER-DEPLOY.md and ACCESS-LEVELS.md. |
| `firebase*.json` | Firebase settings: `firebase.json` for the dev emulators, and the others for separate emulator sets on other ports (`firebase.spare.json` for tests, `firebase.events.json` and `firebase.comms.json` for two of the windows). |

**Built files and copies.** Some files are made from others, so the page and the server can share code. Change the source, then run its builder:

| Source | Built or copied file | How |
|---|---|---|
| `firestore.rules` | `firestore.build.rules`, `firestore.churches.rules` | `node tools/rules-build.mjs` |
| `help/*.md` | `functions/help-texts.json` | `node tools/help-build.mjs` |
| `data-map/*.json` | `functions/data-map.json` | `node tools/data-map-build.mjs` |
| `egbc-team-jobs.js` | `functions/team-jobs.js` | `node tools/team-jobs-build.mjs` |
| `egbc-notify-core.js` | `functions/notify-core.cjs` | copied as it is; `tests/check-notify-send.mjs` checks they match |
| `egbc-plan-store.js` | `functions/plan-store.cjs` | `node tools/plan-store-build.mjs` |
| `egbc-mailblocks.js`, `egbc-notices.js`, `egbc-services.js` | `functions/mailblocks.cjs`, `notices.cjs`, `services.cjs` (the Monday e-news draft) | `node tools/enews-draft-build.mjs` |

Each has a check that fails when the built file is out of date.

**Cache stamps.** Pages load shared scripts with a stamp, for example `egbc-auth.js?v=202611010900`, so phones fetch a changed file instead of a cached one. When you change a shared script, give it a new stamp everywhere it is loaded. The Menu's stamp is `MENU_V` in `egbc-shell.js`, with a fingerprint of the Menu file. `node tests/check-stamps.mjs` checks them. Stamps should be set by a script, not by hand. **(changing)**

## 4. Sign-in, and who sees what

**Signing in.** People sign in with Google or an email link (Firebase Authentication). `egbc-auth.js` is loaded on every page. It signs the person in, reads their record and decides what they may see. A page waits for it:

```js
EGBCAuth.require().then(function (profile) { /* draw the page */ });
```

Or, with no script of its own, a page can be guarded by a tag:

```html
<script src="egbc-guard.js?v=..." data-job="office"></script>
```

`egbc-guard.js` hides the page until the check passes. Its options are `data-team`, `data-job`, `data-role`, `data-admin`, `data-master`, `data-also-team` and `data-also-job`; its header explains each one.

**Who a person is.** Their sign-in matches an **address book** record (`addressBook`) by their email address. The server keeps `users/{uid}` in step with that record. The levels, from least to most:

| Level | What makes it | In the rules |
|---|---|---|
| Pending | signed in, but no address book record has their address | `active()` is false |
| Attender | an address book record, not archived, not a child's | `isAttender()`, `active()` |
| Church member | the office has ticked "Church member" on it | `isChurchMember()` |
| Team member | the record lists teams (`markers`) | `onTeam(team)`, `volunteer()` |
| Admin of a team | `adminFor` lists the team | `isAdmin()` |
| Master admin | `masterAdmin: true` | `isMaster()` |

ACCESS-LEVELS.md lists every collection and who can read it. It is generated from the rules: `node tests/check-access-levels.mjs --write`.

**Jobs, not team names.** Churches name their teams differently, so the code **never names a team**. It names a **job**: `office`, `worship`, `av`, `children`, `youth`, `trustees`, `finance`, `safeguarding`, `communications` and so on, 15 in all. Each church says which of its teams do each job (`churchSettings/teamJobs`, set in Teams and groups). The code asks:

- in a page: `EGBCAuth.myJobs()` (after `EGBCAuth.loadPerms()`);
- on the server: `readTeamJobs(db)` and `teamsFor(map, 'office')`, from `functions/team-jobs.js`.

If you find yourself typing a team's name, such as "Church office" or "Elders", stop and use the job.

**Core teams** cover other teams. A Worship Core Team covers Worship, AV and Choir, so its people count as those teams. See `functions/core-teams.js`.

**Permissions** are finer-grained actions that a master admin can give or take away on the Permissions screen (`permissions.html`), for example "upload to the AV videos". The server works each person's actions out (`functions/permissions.js`) and puts them on their sign-in as a claim (`perms`), so the Storage rules can check them without a database read.

**Parts the church uses.** A master admin can switch whole parts off (the e-news, payments, Kids Church check-in...) in Church settings. These are the features in `churchSettings/features`. A part that is off is hidden everywhere. Its data and rules are untouched. Every new feature needs a feature name: check it in a page with `EGBCAuth.uses('<name>')`, and on the server with `featureOn(db, '<name>')`.

**Under-18s** are never emailed, never shown as a contact, and never put on a list they shouldn't be on. Their records carry `under18` or `isMinor`. On the server, `functions/under18.js` is the one rule. Every send path refuses a list that contains one.

**The Menu** (`egbc-menu.js`) lists every page. Each entry carries the same conditions as the page's own guard, so the Menu never offers a page that will then turn the person away.

## 5. Running it locally, testing it and deploying it

### What you need
- Node 22 or later, and Java 21 (the emulators need it).
- The Firebase CLI: `npm install` in `v2/` installs it, with the rules-test library; then run it as `npx firebase`.
- `npm install` in `v2/functions/` as well, for the functions.

### Running it on your computer
1. **Start the emulators** from `v2/`: `npx firebase emulators:start`. They are local copies of Firestore (port 8181), Auth (9099), Storage (9199) and Functions (5101), using `firebase.json`. The emulator UI is at http://localhost:4000.
2. **Serve the pages:** any static web server on the `v2/` folder, for example `npx http-server -p 5500`.
3. **Open** http://localhost:5500/hub.html.

**Safety:** a page served from `localhost` or `127.0.0.1` talks to the emulators, never to the live database (`egbc-auth.js` switches it). Only a page that uses `EGBCAuth.db` gets this protection, which is another reason never to start Firebase yourself. Before any test that saves something, check that the page really is on the emulator.

**Test data is made up.** Use names like "Synthetic" and addresses at `example.invalid`. Never copy real people's details into a test, a screenshot or a commit.

**Several people at once.** Other people may run emulators on the same computer. Each emulator set has its own ports (`firebase.spare.json` and the rest), and each test says which it uses. Stop your emulators when you're done.

### Testing
- **Rules:** `npm run test:rules` (from `v2/`, with `EGBC_FIREBASE_CONFIG=firebase.spare.json` set). It runs `firestore-rules.test.mjs`, `storage-rules.test.mjs`, `church-scope-rules.test.mjs` and `church-rules.test.mjs` against the real rules engine.
- **Functions:** `npm run test:functions`. Each `functions/*.test.mjs` tests a function's normal case and its refusals on the emulator.
- **The page checks:** `node tests/run-all.mjs` with the dev emulators running. These drive the pages in a headless Chrome. They are slow, and they run one at a time on purpose, so that two checks never seed over each other.
- **Lint and types:** `npm run lint`, `npm run format:check` and `npm run typecheck`. The settings are in `eslint.config.js`, `.prettierrc.json` and `tsconfig.json` (`functions/tsconfig.json` for the server). They are report-only for now: the code has not been reformatted yet, and the existing warnings are being worked down.
- **CI:** `.github/workflows/checks.yml` runs lint, the type check, the rules tests and the functions tests on every push, and checks that the server's copies of page scripts are up to date. It is report-only for now. While Church HQ is in `v2/`, the copy that runs is the repository's top-level `.github/workflows/church-hq-checks.yml`, the same file, run only when `v2/` changes. Change the one in `v2/` and copy it up. **(changing)**

### Deploying
**Functions** go from `v2/` with the codebase always named:

```
npx firebase deploy --only functions:hub
```

or one function at a time: `--only functions:hub:enewsSignup`. **Never** run a bare `--only functions`. The project also holds a function that isn't in this repository (`sendEmail`), and the CLI would offer to delete it. SERVER-DEPLOY.md has the details, including the one-off IAM role the server needs.

**Rules are deployed only on the day a church goes live,** never before: the original EGBC site still reads and writes the same database without signing in. GOING-LIVE.md is the list for that day, in order.

**Gates.** Some parts are built but deliberately shut on the live site until the rules are on: the e-news (`ENEWS_LIVE` in `functions/enews-gate.js`), payments (`PAYMENTS_LIVE` in `functions/payments-gate.js`) and Canva (`CANVA_LIVE` in `functions/canva.js`). Each is a one-line change and a deploy, done on the day.

**Secrets** (the email service key, the Daily key, the AI key) are in Google Secret Manager, read by the functions that declare them. They never go in code, logs, chat or a web address. Adding a new secret is a decision for the reviewer, not something to slip into a change.

**Live data.** Changes to live records are done by a script in `tools/` that a person runs, never by hand in the console. Each script shows what it would do first (a dry run) and only writes with `--write` or `--apply`. Running it twice changes nothing more.

**Environments.** Today there is the emulator and live. A staging project, deploys from CI, `version.json` and daily backups are planned (ENGINEERING.md §6). **(changing)**

## 6. The data map

Firestore has no foreign keys. A record "links" to another only by storing its id, and deleting a document doesn't delete what links to it, or even its own subcollections. So every link has a written rule, and the **server** carries it out, never the page (a page can close half-way).

**Where it is:** `data-map/main.json`, `events.json` and `comms.json`, one per area. `node tools/data-map-build.mjs` joins them into `functions/data-map.json`, which the server reads.

**For each collection, the map says:**
- what it is;
- what happens to the record itself (`self`): `delete`, `archive` (never deleted, only marked archived) or `retention` (kept for as long as the law says, then removed by the retention tools);
- each id it stores that points somewhere else (`eventId`, `personId`, `groupId`...), with a rule:

| Rule | When the parent goes |
|---|---|
| `cascade` | these go too: things that mean nothing alone (a meeting's private part, a group's members) |
| `block` | the parent can't go while these exist; the page says why |
| `keep-history` | these stay, with the parent's name copied in and the link marked gone (`parentGone`) |
| `archive` | the parent is never deleted, only archived |

**Legal records are never cascaded away:** safeguarding, health and safety, accidents, Gift Aid and finance. The builder refuses a map that would. A person's GDPR erasure goes through the privacy tools (`privacy.html`, `functions/privacy-tools.js`), not an ordinary delete.

**Who carries it out:** `functions/data-links.js`. It makes a `tidyAfterDelete-<collection>` trigger for every parent in the map, for both EGBC's path and the churches' paths, safe to run twice. `functions/orphan-sweep.js` (`orphanSweep`) runs nightly, finds children whose parent is gone, fixes what the rule says and logs the count. The count should be 0.

**When you add a collection,** add it to your area's map in the same change, with its links and rules, and run the builder.

## 7. Where each feature lives

The page, its main shared script and its functions. Most pages have help at `help/<page>.md`.

**People and teams**
- Address book: `addressbook.html`. Teams and groups, and which team does each job: `teams-admin.html`, `egbc-team-jobs.js`, `functions/team-jobs.js`, `core-teams.js`.
- Permissions: `permissions.html`, `egbc-permissions.js`, `functions/permissions.js`. Sign-in and the levels: `egbc-auth.js`, `egbc-guard.js`, `login.html`.
- Small groups: `groups.html`, `groups-admin.html`. Privacy and retention: `privacy.html`, `retention.html`, `data-records.html`, `functions/privacy-tools.js`.

**Sundays**
- The rota: `Planner.html` (planning), `view-only-rota.html`, `index.html` (the availability form), `functions/availability-form.js`, `rota-feed.js` (calendar subscriptions), `reminders.js`.
- Service plans: `SundayServicePlanner.html`, `youthserviceplanner.html`, `egbc-plan-store.js`. The church's own services: `services-settings.html`, `egbc-services.js`.
- Preaching plan, session planner, Present and the screens in church: `preaching-plan.html`, `session-planner.html`, `present.html`, `churchshow.html`, `functions/churchshow*.js`, `present.js`, `quiz.js`.
- Worship and AV resources: `Library.html`, `EGBC-PlayThrough.html`, `EGBC-HowTo-AV.html` and the other team pages.

**Children and young people**
- Kids Church check-in: `kids-checkin.html`, `checkin.html`, `kids-admin.html`, `functions/kids-counts.js`. Calling a parent: `functions/notify.js` (`callParent`).
- The youth app and its codes: `youthapp2.html`, `youth-access.html`, `functions/youth-hub.js`, `youth-redeem.js`.

**Care and safeguarding**
- Safeguarding: `safeguarding.html`, `safeguarding-risk.html`, `safeguarding-settings.html`, `functions/sg-*.js`.
- Care, prayer and "I'm worried about someone": `care.html`, `care-inbox.html`, `prayer.html`, `worried.html`, `pastoral-visits.html`.

**Events and buildings**
- Events and sign-ups, What's On: `events-admin.html`, `whatson.html`, `whatson-embed.html`, `functions/events-feed.js`, `rota-whatson.js`.
- Rooms, hire and bookings: `rooms.html`, `hire.html`, `book.html`, `bookings-admin.html`, `functions/rooms-day.js`.
- Health and safety, compliance, maintenance: `compliance.html`, `hs-settings.html`, `risk.html`, `assessment.html`, `maintenance.html`, `lone.html`, `peep.html`, `functions/compliance.js`, `ra-*.js`, `lone-working.js`, `peeps.js`.

**Communication**
- Notices: `hub.html?notices=1`, `egbc-notices.js`.
- The Email Compiler (group emails, with small groups, households, templates and a phone note): `EmailBuilder2.html`, `functions/compiler-send.js`. Every email from a page goes through `functions/hub-send.js` (`hubSend`), which checks who may email whom.
- Emails from the server: `functions/public-mail.js` (`makeSender`) and `mail-route.js`, through Church HQ's Resend (`hq-mail.js`). Every email is logged in `emailOutbox` ("Emails sent", `comms.html`; "My messages", `my-messages.html`).
- The e-news: `enews.html`, `enews-edit.html` (the editor, `egbc-enews-editor.js`), `egbc-mailblocks.js` (the email's blocks), `egbc-starters.js` (starter templates); `functions/enews.js` (sign-up, confirm, unsubscribe, bounces), `enews-draft.js` (the week's draft, made at 7am on Mondays), `enews-send.js` (scheduled sending), `enews-preview.js` (the web version), `welcome-mail.js`. The public pages: `enews-signup.html`, `enews-confirm.html`, `enews-unsubscribe.html`, `enews-web.html`.
- The card maker, social posts and verse of the day: `cardmaker.html`, `egbc-votd.js`, `functions/social.js`, `unsplash.js`. Canva: `canva.html`, `functions/canva*.js`.
- Phone notifications: `notifications.html`, `egbc-notify.js`, `egbc-notify-core.js` (what each message says, and who gets what), `functions/notify.js`.

**Meetings and votes**
- Video meetings: `meeting.html`, `egbc-video.js`, `functions/video.js`, `meeting-rooms.js` (every meeting's own room), `meeting-manage.js`, `meeting-split.js` (a meeting's private part in `meetings/{id}`).
- Members' meetings and votes: `church-meeting.html` (before and after: papers, proxies, results), `egbc-vote.js` (the vote panel inside the call, and the phone view), `functions/members-meeting.js`, `meetings.js` (`castVote`, `voteOpen`, `voteClose`, `voteQuick`), `meeting-papers.js` (papers for members without an account).

**Giving and money**
- Giving: `give.html`, `give-regularly.html`, `giving-details.html`, `egbc-giving-form.js`, `functions/gocardless.js`, `payments.js`, behind `payments-gate.js`.
- Gift Aid: `giftaid.html`. Payments admin: `payments.html`.
- Sermons and the podcast: `watch.html`, `watch-admin.html`, `sermons-admin.html`, `functions/sermon-links.js`, `sermons-feed.cjs`, `feeds.js`.

**Setting up a church**
- `setup.html` and `egbc-setup.js` (the steps), `your-church.html` (name, address, logo, the church's words, giving), `church-settings.html`; `tools/hq-create-church.mjs`; `functions/hq-directory.js` (the directory and sign-in claims), `hub-address.js` (each church's address).

**Built-in help:** `egbc-help.js` (the "?" panel and the Ask box), `help/*.md`, `functions/help-ask.js` (answers only from that page's help, never from church data).

## 8. How to add a page

1. **Make the page** in `v2/`, as `<name>.html`. Copy the `<head>` of a similar page: the Firebase scripts, `egbc-shell.js` (the bar and the look), `egbc-auth.js`, then `egbc-guard.js` with the right `data-` options, then `egbc-help.js`.
2. **Read and write through `EGBCAuth.db`**, never `firebase.firestore()`. Link to other pages with `EGBCAuth.churchLink('other.html')`. Call functions with `EGBCAuth.call('name', data)`, which sends the church for you.
3. **Put the script in its own file** (`<name>.js`) if it is more than a few lines (ENGINEERING.md §3). Aim for under 400 lines.
4. **Nothing of one church's:** no church name, town, address, logo, team name or habit. Take words from the church's settings and jobs from team jobs (section 4).
5. **Give it a feature name** if it is a part a church might not use, and check it.
6. **Add it to the Menu** (`egbc-menu.js`) with the same conditions as its guard. Then update the Menu's stamp and fingerprint (`MENU_V` in `egbc-shell.js`) and the access matrix (`ACCESS-MATRIX.md`, checked by `tests/check-access-matrix.mjs`).
7. **Write its help** in `help/<name>.md`, in plain words: what it is for, who can use it, how to do each thing, and who to ask. Then run `node tools/help-build.mjs`.
8. **Check it at phone width** (375 pixels) as well as on a computer.
9. **If it stores something new,** see the next section.

## 9. How to add a function

1. **Write it in its own file** in `functions/`, by area, and export it from `functions/index.js`. Everything is in `europe-west2`.
2. **Take the church from the request:** `churchOf(request, getFirestore())` for a callable, `churchFromPath(event, getFirestore())` for a trigger (and write the trigger twice: EGBC's path and `churches/{cid}/...`), and `eachChurch(...)` for a schedule.
3. **Check who is calling,** on the server, every time: signed in, active, and allowed (by job, permission or master admin). The page's own checks don't count. Refuse with an `HttpsError` and plain words: the page shows them.
4. **Keep the logic testable:** a plain function that takes `db` and the inputs, and returns an answer, with the callable a thin wrapper around it. `decide()` in `compiler-send.js` and `syncMembersMeeting()` in `members-meeting.js` are examples.
5. **JSDoc on every export:** one line saying what it does, and its parameters' types. Comments say *why*, not *what*. No dates, names of people or work-log numbers in code comments: those belong in git history.
6. **Write a test** in `functions/<area>.test.mjs`: its normal case and each refusal, on the emulator.
7. **A new collection** needs:
   - its rules in `firestore.rules` (then `node tools/rules-build.mjs`), and a rules test;
   - its entry in your area's data map (then `node tools/data-map-build.mjs`);
   - parent and child written together in one batch or transaction, when they are made together.
8. **Logs** say what failed and for which church, never anyone's personal details.
9. **A new secret** is raised with the reviewer first.
10. **Deploying** is `npx firebase deploy --only functions:hub:<name>`, done by the reviewer. Say in your report which functions are new or changed.

## 10. Working on it

- **Several people (and AI sessions) work in this repository at once.** Commit only your own files: never `git add` the whole folder. Pull and rebase before you push, and look for conflict markers in what you commit. When two changes meet in a built file, rebuild it instead of merging it by hand.
- **Line endings:** the files are CRLF on Windows checkouts. Keep what a file has.
- **The original site:** never change files outside `v2/`, and never test against the live original site.
- **Going live** is a list in GOING-LIVE.md, done in order, with who and how to tell it worked. "Going live" is the right phrase. Not every church moves from another system, so don't call it a switch-over.
- **If something is unclear,** the code's own header comments usually explain why it is the way it is. Each shared script and most function files start with one. The work logs (`FINDINGS-*.md`) hold the history of every decision, if you need to know when and why something changed.

## 11. Mistakes people have made, so you needn't

- **Naming a team in code.** "Church office" worked for EGBC and broke for a parish whose office team is called "Admin". Use the job (section 4).
- **A path built by hand,** such as `db.collection('churches').doc(id)...` in a page. It skips the church check. Use `EGBCAuth.db` or `scopedDb`.
- **A trigger written once.** A trigger on `news/{id}` only sees EGBC's news. Every trigger needs its `churches/{cid}/...` twin.
- **Editing a built file.** `firestore.build.rules`, `functions/help-texts.json` and the rest are overwritten by their builder, and their checks fail while they are out of date.
- **A shared script changed without a new stamp.** Phones keep the old copy for days. For the Menu, the stamp is `MENU_V` in `egbc-shell.js`, not the tag on the pages.
- **`*/` inside a comment,** for example a path like `churchMeetings/*/votes` written in a `/* ... */` comment. It ends the comment early and the file stops parsing. Write the path another way.
- **Trusting the page.** Hiding a button stops nobody: anyone can call Firestore directly. The rules, and the server's own checks, are the protection.
- **Writing parent and child separately.** If the page closes between the two writes, half a record is left behind. Use one batch.
- **A query with no limit and no paging,** or a hidden cap such as "the first 30". A bigger church has more. Page through, or say "Showing the latest N" and offer more.
- **Words in an email or a phone note that shouldn't travel.** A phone's lock screen is read by whoever holds it, and an email can be forwarded. Care and safeguarding notifications say which kind of thing has come in, and nothing else.
- **Deploying the rules early.** The original site still uses the live database without signing in. The rules go on only on the day the church goes live.
- **`firebase deploy --only functions`** with no codebase named. It offers to delete a function that lives outside this repository. Always use `functions:hub`.

## 12. Words used here

| Word | Meaning |
|---|---|
| **Church id** | A church's key in the directory (`st-aidans`). EGBC has none: its data is at the top level. |
| **Slug** | The short name in a church's address (`st-aidans.churchhq.co.uk`). Usually the same as its id. |
| **Claim** | Something the server writes onto a person's sign-in, which the rules and functions can trust: `churches`, `perms`. |
| **Scoped db** | The stand-in for the database that keeps every read and write inside one church. |
| **Job** | One of the 15 kinds of work a church's teams do (`office`, `worship`...). The code names jobs; each church says which of its teams do them. |
| **Feature** | A part of the hub a church can switch off, by name. |
| **Gate** | A switch in a function file that keeps a built part shut on the live site until the day it goes live. |
| **Data map** | The list of every collection, what it links to, and what happens when the parent goes (section 6). |
| **Built file** | A file made by a tool from another; never edited by hand. |
| **Stamp** | The `?v=...` on a script's address, changed whenever the script changes. |
| **The emulators** | Local copies of Firestore, Auth, Storage and Functions, for running and testing without touching live data. |
| **Going live** | The day a church starts using Church HQ for real: rules deployed, gates opened, in the order in GOING-LIVE.md. |
| **Windows** | The separate working sessions (main, events, Comms, the reviewer) that each own parts of the code. Their work logs are the `FINDINGS-*.md` files. **(changing: they become history)** |
