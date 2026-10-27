# FINDINGS: Church HQ as a platform (main window)

*For the reviewing window and Martin. These are plans only; nothing here is built until it is agreed.*

## H-1. More than one church: A, B or C (21 Oct 2026)

**Decided (Martin, 22 Oct 2026): B.** The order of work is from the plan. Report after step 2 (the directory and claims; the rules and paths with cross-church suites, made-up churches only). EGBC's live data isn't moved and the rules aren't deployed until going live.

**Design note:** `design-mocks/multi-church/PLAN.md`.

Martin: "Church HQ must support more than one church from now on, built in, not later." Three ways are compared:
- **A:** a Firebase project per church;
- **B:** one shared project, every record and rule keyed by church;
- **C:** groups of churches per project, with B inside each.

**The table covers:** isolation and GDPR deletion, rules, cost, deploys and keeping code in step, web address, the phone app, sign-in, ChurchShow pairing, quiz codes, and EGBC's existing data. It also gives the deploy time and quotas at 10, 100 and 1,000 churches.

**Recommendation: B**, built with every church's data under `churches/{churchId}/…`, so C is a later switch, not a rebuild:
- Membership is in the sign-in's claims.
- Safeguarding data sits on its own per-church path, with automated tests that try to cross churches.
- A Church HQ directory knows each church's group (project).
- **For a church whose policy needs physical separation:** a group of one, meaning its own project with the same code. That meets Martin's safeguarding concern without 124 functions per church for everyone.

**The numbers that decide it** (deploy time is an estimate, to be measured):

| Churches | A | B |
|---|---|---|
| 1,000 | 124,000 functions; ~25 hours per full update (10 at once); 15,000 Scheduler jobs (~$1,500/month); project quota Google grants case by case | 124 functions; ~15 minutes; 15 jobs |

**For Martin to decide:**
- B, A or C;
- the domain and the Cloudflare proxy;
- EGBC moves into the shared project, or keeps its own;
- whether any church needs a separate project from the start.

## H-2. Billing (21 Oct 2026)

**Design note:** `design-mocks/billing/PLAN.md`.

**Church HQ's subscription:** NOT DECIDED (Martin, 22 Oct). It will be GoCardless, not Stripe. Nothing is built, and there are no HQ_STRIPE_* secrets.

**A church's accounts link:** one adapter per system behind the existing `accountsQueue`, in this order:
1. spreadsheet export (no review);
2. Calla Accounts;
3. QuickBooks Online (needs Intuit production keys);
4. Xero (Xero's current app terms and connection limits; certification beyond them).

**What Martin needs for those reviews:**
- privacy and terms pages on churchhq.co.uk;
- a support email;
- a logo;
- answers to a security questionnaire, which I can draft.

## H-3. Multi-church step 1 built: the directory and the claims (22 Oct 2026)

**No data is moved, and nothing of EGBC's is touched.**

- **`hqChurches/{churchId}`: the Church HQ directory.**
  - Fields: name, domain, group (`main` for every church now), status.
  - Written only by the server and Church HQ's scripts.
- **`hqMemberships/{churchId}_{uid}`:** this person belongs to this church. Server-written only.
- **The trigger `hqMembershipClaims`** recomputes the person's custom claim `churches: [ids]` whenever a membership is written or removed.
  - It **merges** with the claims they already have, so a ChurchShow computer keeps device/siteId.
- **`hqMyChurches`:** a callable that returns the caller's own churches from the directory, for a church picker.
- **`EGBCAuth.churches(fresh)`:** the page's read of the claim.
- **Rules** (live when the hub goes live):
  - a person reads the directory entries of the churches in their own sign-in, and their own memberships;
  - no page writes either.

**Checks:**
- **check-hq-claims: 17/17, made-up churches on the spare emulators.** Break: claims replaced instead of merged → 5 red.
- **Rules suite: 1713/1713.**

**Deploy when wanted:** `hqMembershipClaims` and `hqMyChurches`. They do nothing until a membership is written.

**Next: step 2.** The rules and paths under `churches/{cid}`, with the cross-church suites, on made-up churches only. Then a report before going further.

## H-4. Multi-church step 2 built: every church's data under churches/{cid} (22 Oct 2026)

**Made-up churches only (mc-alpha, mc-beta). EGBC's data is not moved. The rules are not deployed; they go live when the hub goes live.**

- **The gate, first on every path under `churches/{cid}`:** the church is in the sign-in's `churches` claim (step 1 sets it).
- **A person's place inside a church comes from that church's own record,** `churches/{cid}/users/{uid}` (status, teams, adminFor, masterAdmin, memberId). Never from EGBC's top-level `users`. The server writes it; no page can.
- **The first collections with rules there:** settings, users, addressBook, news, careRouting, leaderChecks (the lead and deputy, a master admin, or the person). Everything else under a church is shut until it moves in with its rules.
- **Storage:** `churches/{cid}/files/…`, behind the same gate; members read, admins upload. Anything else under a church is shut.
- **No new top-level collections:** `tests/check-top-level.mjs` fails when one appears outside `churches/{cid}` without a reason in `tests/top-level-collections.json`.

**Checks:**
- **church-scope-rules.test.mjs: 1975/1975.** It includes 1,920 cross-church checks over 192 collection names: a master admin, admin and member of one church cannot read, list or write any of them in the other, and the other way round.
- **check-top-level: 4/4.**
- **Existing suites:** rules 1763/1763, storage 131/131.

**Breaks:**
- **Claim gate removed:** 5 red. The church's own users record still kept the other church's settings and news shut, so there are two locks.
- **Roles read from EGBC's `users`:** 18 red, including an EGBC master admin who is only a member in alpha writing alpha's settings.
- **Storage gate removed:** 1 red.
- **Storage roles read from EGBC's `users`:** 3 red.
- **A stray top-level collection:** check-top-level red, naming it.

**Deploy:** nothing. No functions changed.

**Next (step 3, after review):** functions take churchId from the path or the claims.

## H-5. Multi-church step 3, the plan: functions take the church from the path or the sign-in (22 Oct 2026)

**Nothing moves and EGBC sees no change.** Someone with no `churches` claim (everyone at EGBC today) gets EGBC's top-level data, exactly as now.

**One helper, `functions/church-scope.js`:**
- **`churchOf(request)`** works out which church a call is for:
  - The page may name a church (`data.churchId`). It must be one in the sign-in's `churches` claim, or the call is refused (permission-denied).
  - If the page names none, the sign-in's only church is used. With two or more churches, the call is refused: "Say which church."
  - With no claim at all, it falls back to EGBC (`legacy: true`).
  - The church never comes from anything else the page sends.
- **It returns `{ id, legacy, db }`.** `db` is a stand-in with the same `.collection()`, `.doc()`, `.batch()`, `.runTransaction()` and `.getAll()`. For a church, `.collection('news')` means `churches/{id}/news`. For EGBC it is the real top-level `db`. So most functions change only `db` → `ch.db`, and every read and write inside then stays in that church.
- **`churchFromPath(event)`** is for triggers. `churches/{cid}/news/{id}` gives `cid`; the top-level path gives EGBC.
- **`eachChurch(db, fn)`** is for scheduled jobs: EGBC first (legacy), then every active church in `hqChurches`, one at a time. One church failing doesn't stop the rest.

**What it touches: 129 functions** (69 callables, 15 web endpoints, 16 scheduled jobs, 29 triggers).

| Batch | Mine | Functions |
|---|---|---|
| 1 | yes | The helper; whoAmI, findMe, myDates, saveAnswer, myCalendarLink(s), myFamily, myYouthHub |
| 2 | yes | Messages: hubSend, notifyTest, callParent, compilerSend |
| 3 | yes | Meetings and video: castVote, voteOpen/Close, proxyAppoint/Cancel/People, videoRoomsEnsure, meetingHostToken, meetingPapers; churchShowPairingCode/Disconnect/SetJob/Rename |
| 4 | yes | Codes and links that arrive without a sign-in: churchShowRedeem, redeemYouthCode, rotaFeed and the calendar links |
| 5 | yes | Triggers, a second one on each church path: urgentNotice, bookingNotify, maintJobNotify, worry/prayer/helloNotify, careStatusFromSettings/Site, familyGroupsSync, rotaWhatsOn, welcomeNewcomer/Subscriber |
| 6 | yes | Scheduled jobs, church by church: rotaReminders, bookingReminders, documentExpiryReminders, careStatusSync, checksReminders, feedSync |
| 7 | events | present*, quiz*, payments*/ticketPay/paymentCheck*, giving*/gocardlessWebhook/stripeWebhook, compliance/peeps/kids-counts/rooms-day/checklist/prayer-sunday/sermon-links, lessonFor, planSend, bible*, m365*, eventsFeed/myEventsFeed/emailMyFeedLink, commsReport/myMessages, teamMail*/sendAsTeam, publicMail* |
| 8 | Comms | enews*, hqMailEvents, hqMailKey*, socialMorning, canva*, unsplash* |

**Shared services carry the church:**
- **Codes and links that arrive with no sign-in** (ChurchShow pairing, youth codes, calendar and rota feed links, e-news tokens, quiz codes) get a top-level index, `hqCodes/{kind}_{sha256}` = `{ churchId }`, written by the server only. The code itself is unchanged. EGBC's codes keep working because a missing index entry means EGBC.
- **A ChurchShow PC paired to a church** gets `churches: [cid]` in its claims beside device/siteId. The merge from step 1 already keeps both.
- **Daily rooms are already named `<churchId>-<key>`** (`dailyName`). `churchSettings/video.churchId` comes from the church, not from a constant.
- **Quiz codes:** two churches can't hold the same code at once, because the index is shared.

**Checks for every batch** (spare emulators, made-up churches mc-alpha and mc-beta, one test at a time with more than 3 GB free):
- Each callable is called as a member of mc-alpha:
  - with beta's churchId: refused;
  - with beta's ids (event, meeting, member, room, device): refused or not found;
  - nothing is written in beta.
- The same call with no claim still does what it does today, on EGBC's top-level data.
- Each batch also gets a break: the helper ignoring the claim must turn its suite red.

**Deploy:** after each batch, the functions it changed.

**For decision:** batches 7 and 8 are in the events window's and Comms' files. Shall I do them myself, or ask those windows to adopt the helper, with my check harness and a request in their FINDINGS?

### H-5, batch 1 built: the helper, and whoAmI, myFamily, myYouthHub (22 Oct 2026)

- **`functions/church-scope.js`:** churchIdOf, churchOf, scopedDb, churchFromPath and eachChurch, as planned.
- **whoAmI, myFamily and myYouthHub** now read through `churchOf(request, db).db`.
- **Moved to batch 4:** findMe, myDates, saveAnswer and the calendar links. They run on codes and links (form sessions, feed keys), so they go with the code index.
- **check-church-calls: 25/25** (spare emulators). The same member id is in alpha, beta and EGBC, each with a different household:
  - Ann (alpha) gets alpha's answer, and naming beta is refused.
  - Eve (no claim) gets EGBC's top-level answer, as today, and naming alpha is refused.
  - Dot (both churches) must say which.
- **Breaks:**
  - The helper ignoring the claim: 16 red.
  - A named church not checked: 6 red.
- **Still passing:** check-availability-form 52/52, check-family 40/40, check-youth-hub 16/16, check-rota-shared-roles 2/2.
- **Deploy:** whoAmI, myFamily, myYouthHub. EGBC sees no change: nobody at EGBC has a churches claim.

### H-5, batch 2 built: hubSend, compilerSend, callParent, notifyTest (22 Oct 2026)

- **hubSend and compilerSend** take the church's db from `churchOf`. Each church then has its own people to email, its own hourly limit, its own name on the From line and its own outbox.
- **callParent and notifyTest** take the church's db through `notifyDeps({ db })`, so each church has its own on/off switch, phones and check-ins. The triggers and scheduled jobs (batches 5 and 6) will use the same option.
- **makeSender (Comms') is unchanged.** It is only handed the church's db.
- **check-church-calls: 42/42.** New for this batch:
  - Ann emails someone alpha knows, and the row lands in alpha's outbox, not EGBC's.
  - Ann cannot email someone only beta or only EGBC knows, and beta's outbox stays empty.
  - Eve (no claim) emails someone EGBC knows, as today.
  - Ann giving beta's child's check-in id: no such child in alpha.
  - Ann's notification test follows alpha's switch (on); Eve's follows EGBC's (off) and is refused, as today.
  - Naming beta is refused for each callable.
- **Breaks:**
  - The four functions back on EGBC's top-level db: 4 red.
  - The notify functions alone back on EGBC's db: 2 red.
- **Still passing:** check-hub-send 25/25, check-notify-send 82/82, check-who-may 16/16, check-no-calla 14/14.
- **Deploy:** hubSend, compilerSend, callParent, notifyTest.
  - rotaReminders and the notify triggers share `notifyDeps`. They behave the same without the option, but redeploy them too so the code is one version: rotaReminders, bookingNotify, maintJobNotify, urgentNotice, worryNotify, prayerNotify, helloNotify, checksReminders.

### H-5, batch 3 built: votes and video (22 Oct 2026)

- **castVote, voteOpen, voteClose, proxyAppoint, proxyCancel, proxyPeople:** the shared wrapper takes the church's db from `churchOf`. One church's votes, ballots, tallies and proxies cannot be reached from another.
- **videoRoomsEnsure and meetingHostToken:** take the church from `churchOf`.
  - A church's Daily rooms are named after it (`mc-alpha-prayer`), and its video settings record whose they are.
  - **Fixed on the way:** a church with no rooms yet used to get EGBC's seven rooms and the name "egbc". Now it starts with none.
  - EGBC's own path is exactly as before, and its record is not rewritten.
- **Moved to batch 4, because they work with codes and links:**
  - all of ChurchShow (the pairing code is made in a church, then redeemed with no sign-in);
  - meetingPapers (a public link).
- **check-church-calls: 59/59.** New for this batch:
  - Ann votes in alpha's vote. Giving beta's ids finds no such vote, and beta's tally is untouched. She cannot close beta's vote.
  - Her proxy list is alpha's members only.
  - Eve votes in EGBC's vote, as today.
  - Ann gets alpha's rooms only, made under alpha's name, and her host token is for alpha's room. Asking for beta's room finds no such room.
  - A church with no rooms gets none. Eve gets EGBC's rooms, named egbc-, as today.
- **Breaks:**
  - Votes back on EGBC's db: 4 red.
  - Video ignoring the church: 4 red.
- **Still passing, each on a fresh emulator:** check-meeting-host 19/19, check-members-meeting 52/52, check-meeting-present 8/8.
- **Deploy:** castVote, voteOpen, voteClose, proxyAppoint, proxyCancel, proxyPeople, videoRoomsEnsure, meetingHostToken.

### H-5, batch 4 built: codes and links that come with no sign-in (22 Oct 2026)

- **`functions/hq-codes.js`:** when a church makes a code, the server also writes `hqCodes/{kind}_{hash}` = `{ churchId }`.
  - The hash is of the code; the code itself is never stored there.
  - The public endpoint looks the code up there first. No entry means EGBC, so every existing code and every code EGBC makes keeps working.
  - No rule opens `hqCodes`; only the server reads and writes it.
- **ChurchShow:**
  - Pairing, disconnecting, setting the job and renaming all take the church from `churchOf`.
  - A church's computer has `churches: [cid]` in its sign-in, kept when its job changes.
  - churchShowRedeem finds the church from the code.
- **Youth codes:**
  - **New trigger, `youthGrantIndex`, on `churches/{cid}/youthGrants/{id}`.** Pages make youth codes and pages can't write the index, so the server does it.
  - redeemYouthCode finds the church from the code. The young person's access is recorded in that church, and their sign-in carries it.
- **Calendar feeds:** myCalendarLink(s) take the church from `churchOf`, and each link is indexed. Resetting a link removes the old index entry. rotaFeed reads the church's rota.
- **Meeting papers links:** `personalise` indexes a church's link, and meetingPapers opens it. A church's papers live in its own Storage folder.
- **Not moved yet: findMe, myDates and saveAnswer** (the public availability form). The form is used with no sign-in and no code, so nothing in the request can say which church. It stays EGBC's until step 4 gives each church its own address.
- **check-church-calls: 84/84.** New for this batch:
  - Each kind of code made in alpha works with no sign-in and lands in alpha.
  - EGBC's equivalents work as today, with no index entry.
  - Beta's site or computer cannot be reached from alpha.
  - The old rota link stops working after a reset.
- **Breaks:**
  - The index ignored (everything treated as EGBC's): 6 red.
  - A computer's sign-in without its church: 2 red.
- **Still passing:**
  - churchshow-pairing 76/76, rota-feed 45/45, meeting-papers 21/21 and enews-send 48/48 (spare emulators);
  - app-calendar 20/20, calendar-end-to-end 23/23, churchshow-page 17/17 and youth-access 34/34 (fresh dev emulator each).
- **Deploy:**
  - churchShowPairingCode, churchShowDisconnect, churchShowSetJob, churchShowRename, churchShowRedeem;
  - redeemYouthCode;
  - myCalendarLink, myCalendarLinks, rotaFeed;
  - meetingPapers;
  - **new:** youthGrantIndex;
  - enewsSendDue and enewsTest, which call `personalise` (Comms' functions; their code is unchanged).

### H-5, batch 5 built: the triggers, a twin on each church's path (22 Oct 2026)

- **Each trigger now exists twice:**
  - the EGBC one, on its top-level path, by its old name and doing exactly what it did;
  - a twin on `churches/{cid}/…`, named `<name>Church`, running the same handler with the church from the path, never from the document.
- **The twins (10, all new functions):** bookingNotifyChurch, maintJobNotifyChurch, urgentNoticeChurch, worryNotifyChurch, prayerNotifyChurch, helloNotifyChurch, careStatusFromSettingsChurch, careStatusFromSiteChurch, familyGroupsSyncChurch, rotaWhatsOnChurch.
- **Moved to batch 8:** welcomeNewcomer and welcomeSubscriber. welcome-mail.js was made with the e-news editor, so it is Comms'.
- **check-church-calls: 91/91.** New for this batch:
  - a safeguarding lead named in alpha updates alpha's care note, not EGBC's or beta's;
  - a lead named at EGBC updates EGBC's, as today;
  - a Sunday marked for What's on in alpha appears in alpha's calendar, not EGBC's;
  - a hello in alpha is handled with alpha's notification settings and marked as told in alpha.
- **Break:** the church twins handed EGBC's db turned 4 red.
- **Still passing:**
  - rota-whatson 20/20 (no emulator);
  - notify-send 82/82 and rota-whatson-live 8/8 (spare emulators);
  - care 63/63, family 40/40 and notify-switch 10/10 (fresh dev emulator each).
- **Deploy:**
  - **the ten new twins:** bookingNotifyChurch, maintJobNotifyChurch, urgentNoticeChurch, worryNotifyChurch, prayerNotifyChurch, helloNotifyChurch, careStatusFromSettingsChurch, careStatusFromSiteChurch, familyGroupsSyncChurch, rotaWhatsOnChurch;
  - **and the originals, rewritten through the same helper but behaving the same:** bookingNotify, maintJobNotify, urgentNotice, worryNotify, prayerNotify, helloNotify, careStatusFromSettings, careStatusFromSite, familyGroupsSync.

### H-5, batch 6 built: the scheduled jobs, church by church (22 Oct 2026)

- **These now run through `eachChurch`:** bookingReminders, documentExpiryReminders, rotaReminders, careStatusSync, checksReminders, feedSync.
  - EGBC runs first, on its top-level data, as today. Then each active church in `hqChurches` runs on its own data.
  - A closed church is skipped.
  - One church failing doesn't stop the others. Afterwards the run reports the failure, so the job's own retry works as it always did.
- **runBookingReminders and runExpiryReminders** take the church's db; without it, they use EGBC's, as before. Each church's reminders go out under its own details and land in its own outbox.
- **check-church-calls: 97/97.** New for this batch:
  - order: EGBC, then the active churches, skipping a closed one;
  - one failure: the rest still run, then the run fails;
  - booking reminders: each church's booking is reminded from its own data, into its own outbox;
  - the hourly care-note job puts beta's note right from beta's settings.
- **Breaks:**
  - Jobs run for EGBC only: 6 red.
  - Booking reminders ignoring the church: 2 red.
- **Still passing:** check-reminders 38/38, check-feeds 17/17 (spare emulators), check-features-agree 18/18.
- **Deploy:** bookingReminders, documentExpiryReminders, rotaReminders, careStatusSync, checksReminders, feedSync.

**Batches 1–6 (mine) are done.** Batch 7 (the events window's files) and batch 8 (Comms'), plus welcomeNewcomer and welcomeSubscriber, wait on the decision asked for under H-5. findMe, myDates and saveAnswer wait for step 4.

## H-6. Multi-church step 4, the plan: which church a page is for (22 Oct 2026)

**Today:** every page reads and writes EGBC's top-level data. The server (step 3) and the rules (step 2) already keep churches apart. What's missing is the pages: a church's page must use `churches/{cid}/…`, and must know which church it is for. **EGBC sees no change:** on EGBC's own address, with no church claim, everything stays top-level, as now.

**For Martin to decide (PLAN.md decision 2, still open): the address.**
- **(a) One address per church, `<church>.churchhq.co.uk` (recommended).**
  - The same static files are served for every church, through Cloudflare in front of one origin, which handles a wildcard subdomain.
  - The page reads its church from the hostname, through `hqChurches.domain`.
  - Public pages (What's on, giving, e-news sign-up, the availability form) then know their church with nobody signed in.
  - GitHub Pages can't serve wildcard subdomains, and Firebase Hosting allows 36 sites per project, so neither scales to hundreds of churches. Cloudflare's free plan does.
- **(b) One shared address, with the church in the path (`hub.churchhq.co.uk/c/<church>/…`).** No DNS per church. But every link, QR code and embed must carry the path, and a page served at the wrong path is easy to make.
- **Sign-in decides between them.**
  - The hub signs in with email links and Google. Firebase only accepts those on authorised domains, and the list takes no wildcards.
  - With (a), either each church's subdomain is added when the church is set up (a server step in "add a church", up to Firebase's limit, which I'll confirm before building), or sign-in happens on one address (`account.churchhq.co.uk`) and returns to the church's.
  - I recommend the second: one sign-in address, nothing per church.

**Build order (each with checks and breaks; made-up churches only):**
1. **The rest of the rules, ported to `churches/{cid}`.** Step 2 moved six collections. The other 180-odd keep their top-level rules, and those are shut for churches until ported.
   - Proposed: generate the church copy from the top-level rules mechanically (`me()` becomes the church's users record, every path under the church).
   - Then run the whole existing rules suite (1,763 cases) against a made-up church, as well as the cross-church suite (1,975).
   - A check fails if the two copies drift.
2. **A church-scoped `EGBCAuth.db`** in egbc-auth.js. It has the same `.collection()`, `.doc()`, `.batch()` and `.runTransaction()` as the server's `scopedDb`. When a church is chosen, `collection('news')` means `churches/{cid}/news`; with none, it is top-level, as now.
   - Storage paths get the same prefix.
   - **The pages that call `firebase.firestore()` themselves** (4 files) are moved onto it. A static check fails any page that goes around it.
   - Functions calls send `churchId` (the server checks it against the claim, step 3).
3. **Which church:**
   - the address decides it (a), and the sign-in's claim must include that church, or the page says "You're not a member of <church>" and offers the right one;
   - signed in to two churches on a shared page: the app's church picker, the choice remembered on the device, and a switch in Menu > You.
4. **Public pages and the public functions:**
   - What's on and the embed, e-news sign-up, the availability form (findMe, myDates and saveAnswer from H-5), giving and booking.
   - Each takes its church from the address, and the server checks that address against `hqChurches.domain`, never a church id typed into the request.
5. **The app** (installed PWA and phone): one app for every church. It opens the person's church, or the picker if they have two.

**Checks, every part:**
- a made-up church's people see only that church, in the browser, end to end;
- EGBC's pages, unchanged, give the same audit (67 reds today) before and after;
- each part has its break.

**Before building, I need:**
- the decision between (a) and (b);
- whether sign-in moves to one address;
- Cloudflare (Martin's account) only when (a) is chosen.

Until then, part 1 (the rules port) needs no decision, and I can start it.

### H-6, decided (reviewing window, 22 Oct 2026): (a), with one sign-in address

- **The address:** each church at `<church>.churchhq.co.uk` behind Cloudflare, with one shared sign-in address that returns people to their church's address.
- **Not done here:** DNS, Cloudflare, GitHub Pages custom domains and Firebase authorised domains. Martin does those later, as a separate, deliberate step.
- **Everything is built to work on today's address too.** There, no church comes from the address, so the claim (and the picker) decide, and EGBC's pages stay top-level.
- **Part 1, the rules port, starts now,** in small batches, each with the cross-church suites and breaks.

## H-7. Found before porting: the rules are over Firebase's size limit (22 Oct 2026)

**Firebase's limits:** 256 KB on a ruleset's source as deployed, and 250 KB on the compiled ruleset (Firestore quotas and limits, cloud.google.com/firestore/quotas).

**firestore.rules is 341 KB today.** It passed 256 KB on 16 Oct (cd3b39bf), and every window adds to it.
- **Deploying it as it is will be refused** when the hub goes live. This is true before any multi-church work.
- Nothing is live yet, so nothing is broken today.
- With comments and whitespace taken out, the same rules are about 178 KB. That fits. The compiled size can't be measured without Firebase's compiler, so there's some margin to keep.

**What this means for the port (step 4 part 1):** a church copy generated into the same file would be about 355 KB even stripped. One file can't hold EGBC's top-level rules and a church copy, so I've stopped the port rather than build that.

**Proposal for decision:**
1. **One source, a build step, and only the built file is deployed.**
   - We keep writing firestore.rules as now, comments and all.
   - `tools/rules-build.mjs` writes the deploy ruleset with comments and whitespace removed.
   - `firebase.json`'s rules entry then points at the built file. That is a change to what goes live, so it needs your say-so; I won't change it without it.
   - **A check** fails when the built ruleset passes a working limit (say 220 KB, leaving room under 250 KB compiled), and when the built file is out of date with the source.
2. **The church rules are generated from the same source by the same build,** as a second ruleset for the shared Church HQ project. Every path goes under `churches/{cid}`; `me()` reads the church's users record; the claim is the gate (step 2's design).
   - Each project deploys one ruleset (about 180 KB), never both in one file.
   - That fits either EGBC choice from PLAN.md. In (i), EGBC moves into the shared project and only the church ruleset is deployed. In (ii), EGBC's project stays a group of one and deploys the top-level ruleset, while the shared project deploys the church one.
   - The tests run the full rules suite against both, plus the cross-church suite.
3. **The step 2 pilot** (the six hand-written church collections in firestore.rules) moves into the generated church ruleset, so firestore.rules goes back to EGBC's rules only.

**Until you decide:** I won't change firebase.json or the shape of firestore.rules. Part 1 of the proposal (the build script and its check, with no change to firebase.json) is safe to build first, and I'll start it if you agree.

### H-7, built: the deployed ruleset is built from firestore.rules (22 Oct 2026)

- **`tools/rules-build.mjs`** writes `firestore.build.rules`: 177,398 bytes (the source is 341,719).
  - Comments and spare whitespace are removed; text in quotes is copied exactly.
  - Run it after any rules change.
- **firebase.json and every emulator config** (spare, events, ease, tmp) load the built file. So does every rules-engine suite of mine, through the config it already reads. Every test runs against what will deploy.
- **`tests/check-rules-build.mjs`: 6/6.** It fails when:
  - the built file is out of date;
  - the built ruleset is over 230 KB;
  - the built rules aren't the same tokens as the source;
  - a quoted `//` is lost;
  - storage.rules (34,517 bytes) is over 230 KB;
  - any config points elsewhere.
- **Breaks:** a rule changed without rebuilding (1 red); a ruleset twice the size, as one file with a church copy would be (2 red).
- **On the built file:** the rules suite 1872/1872, church scope 1975/1975, storage 131/131.
- **The events window and Comms** were told in their FINDINGS.
- **Next:** step 4 part 1, the church ruleset, generated by the same build as a separate file. Which project it deploys to is Martin's later choice.

### H-6 part 1, batch A built: the church ruleset, generated (23 Oct 2026)

- **`tools/rules-build.mjs` now also writes `firestore.churches.rules`** (177,989 bytes). These are the hub's rules for the shared Church HQ project:
  - every helper and collection rule from firestore.rules is copied inside `match /churches/{cid}`, with all 207 document paths moved under the church, so `me()` reads the church's own users record;
  - `signedIn()` means signed in **and** the church is in the sign-in's claims;
  - users records are server-written only;
  - the directory (hqChurches, hqMemberships) sits at the top; everything else at the top is shut.
  - It's a separate file, never in the same ruleset as EGBC's (H-7). Which project deploys it is Martin's later choice.
- **`church-rules.test.mjs`: 2289/2289**, a differential test on the real engine with made-up mc-alpha and mc-beta.
  - **The property:** someone from another church, or with no church, gets no more of a church than a visitor who isn't signed in.
  - **Cross-church checks: 2,281, over 187 collections and three operations.** Alpha's master admin, admin and member are refused in beta. Someone with no claim, or a record in alpha but no claim, is refused in alpha.
  - **Public to anyone (listed by the test, to be read by eye):**
    - **read, 24 collections:** bookingTypes, bookings, capacity, churchSettings, enewsPreview, enewsWeb, eventCategories, eventInvites, formRequests, formResponses, forms, quizRuns, rateCards, regularGifts, roomClosedDays, roomDays, sensitiveResponses, seriesSignups, sermonSeries, signupPayments, signups, smallGroups, terms, uploadLinks;
    - **list, 10 benign ones:** bookingTypes, capacity, enewsWeb, eventCategories, rateCards, roomClosedDays, roomDays, sermonSeries, smallGroups, terms;
    - **write:** none.
    - The bookings, sign-ups, responses and gifts in the read list are read by knowing the document's id (the link-with-a-key pattern), exactly as in EGBC's rules today.
  - **At home:** alpha's master admin reads 144 of 187 collections, nobody writes a users record, and EGBC's top-level paths are shut.
- **Breaks:**
  - The claim gate removed: 173 red (someone with no claim reads and writes alpha).
  - Paths left at the top level: 1 red (alpha's own master admin reads only 24 of alpha). Cross-church access stayed refused, because the church's users record is the second lock.
- **check-rules-build: 8/8.** The church ruleset must be up to date and under 230 KB.
- **Next, batch B:**
  - run the whole EGBC rules suite (1,872 cases) against the church ruleset as a made-up church, so the church copy behaves like EGBC's rules inside a church;
  - take step 2's hand-written pilot out of firestore.rules, which the generated copy replaces;
  - then storage.rules the same way.

## H-8. Step 4 part 1, batch B: EGBC's whole rules suite run as a church; one limit found (23 Oct 2026)

- **`AS_CHURCH=mc-test node firestore-rules.test.mjs`** runs every one of EGBC's 1,882 rules cases against the generated church ruleset, as one made-up church.
  - Every path is put under `churches/mc-test`, and every sign-in carries that church. The cases themselves are untouched.
  - Without the switch nothing changes: 1882/1882 as EGBC.
- **As a church: 1870/1882.** The 12 differences:
  - **10 are on purpose.** A person writing their own users record (first sign-in, the heartbeat, the address-book mirror) is refused, because in a church users records are server-written only (step 2's decision). Before a church can sign people in, the server must make those records. That's for part 2 (the sign-in flow); noted, not built.
  - **2 are Firestore's limit of 1,000 expressions per request:** "the office books a free room for an event, holding its time" and "with a reason, the office books over it".
- **EGBC's own rules are within one expression of that limit,** in the same two cases.
  - Tested by adding a single spare `&& true` to `signedIn()` in EGBC's built rules: exactly those two cases then fail at the top level too, with "the maximum of 1000 expressions to evaluate has been reached".
  - So **any small addition to the helpers that batch calls** (signedIn, active, me, theOffice, the booking shape) **would stop the office booking a room for an event once the rules are live.**
  - The rules are the events window's booking rules (bookingShape, officeCreate, marksNewBooking and the roomDays batch). I've asked them to find headroom; I haven't changed their rules.
- **The church gate is now `request.auth != null && cid in request.auth.token.churches`.** Reading the claim directly instead of with `.get()` and a default costs fewer expressions. No claim is an error, which refuses.
  - No rule uses `!signedIn()`, so nothing relies on it being false.
  - church-rules.test passes 2289/2289 with it. **Break:** the gate without the claim turns 173 red.
- **Still to do in batch B:**
  - the two booking cases, once the events window has found headroom;
  - step 2's hand-written pilot out of firestore.rules;
  - storage.rules the same way.

### H-8, continued: the pilot is out; and EGBC's rules run out of expressions in a normal run (23 Oct 2026)

- **Step 2's pilot is out of firestore.rules.** The generated church ruleset replaces it.
  - **check-top-level, rewritten (5/5):** every collection in firestore.rules has its copy under `churches/{cid}` in the church ruleset, and the church ruleset's top level is only the directory (hqChurches, hqMemberships). New collections in firestore.rules are fine now; nobody keeps a list.
  - **Break:** a stray top-level collection and a missing one, both red.
  - **church-rules.test** takes its collection names from firestore.rules: 2398/2398 over 197 collections.
  - **church-scope-rules.test** keeps only its Storage half (11/11) until storage.rules is ported.
- **Rules suites now:** EGBC 1893/1893; as a church 1880/1893. The 10 users self-writes are on purpose, and 3 cases hit the expression limit: the two office bookings, plus "and its named leaders" on the events window's new sgAssessments rule.
- **The limit, measured.** In a normal, fully passing EGBC run, the emulator logs "the maximum of 1000 expressions to evaluate has been reached" **126 times**, on five rules:

  | Rule | Times |
  |---|---|
  | sgAssessments create/update | 36 |
  | bookings create | 1 |
  | small groups update (groupShape, groupCountOk, under18Ok) | 11 |
  | events/calEvents update (eventCk) | 15 |
  | the catch-all | 63 |

  - Those cases pass only because a refusal was expected anyway, or another branch allowed them.
  - **A refusal caused by running out of expressions isn't the refusal the rule intended,** and the allowed cases next to it have no room at all.
  - In the church copy, whose gate costs a little more, the same rules (and four more) run out more often.
  - These are the events window's rules; I've asked them to find headroom, and haven't changed them.

## H-9. Team jobs, not team names: the plan (23 Oct 2026)

**For review; nothing is built.** The full plan and the audit table are in `design-mocks/multi-church/TEAM-JOBS.md`.

- **The idea:** the code, rules and functions name a **job** (office, trustees, buildings, pastoral, finance, children, youth, worship, av, choir, leadership, catering, welcome, prayer). Each church maps every job to one of its own teams, or none. Every word a person sees is the church's own team name.
  - EGBC's defaults are today's names, so EGBC needs no data and sees no change.
- **Already settings, to be folded in:** `moneyTeam`, `trusteeTeam` and the prayer team. `runs` on a team stays.
- **Setup:** a "Your teams" step when a church is set up, with suggestions (trustees: Elders, Deacons, Stewards, PCC, Trustees), changeable later on Teams and groups.
- **The audit:**
  - **95 files name a team:** main 61, events 23, Comms 9, and the two rules files, where each window changes its own sections.
  - **9 list caps in the rules:** 20 leaders per event, 60 on a kids morning, 3 sites per screen page, 30 and 50 member lists, 40 on a session, 200 charges.
  - **22 files** that ask Firestore with up to 30 values per query.
  - **Lists cut short on purpose:** each will say so.
- **Rules:** `onTeam('Church office')` becomes `onJob('office')`. Every change is measured against the expression limit (H-8, h8-headroom.test.mjs) before it goes in.

**Questions for Martin** (recommended answer first):

1. **The jobs:** the 14 above. Or fewer (office, trustees, buildings, pastoral, finance, children, youth, worship), with the rest as ordinary teams?
2. **Children's and youth groups** (Lazers, ReNu) aren't jobs. The code asks for "every under-18 group" (the tick already on Teams and groups) instead of naming them. Agreed?
3. **One team per job** (or "nobody"). Or allow several teams for one job, such as Elders and Deacons both as trustees? Recommended: one, with "and also…" only if a church asks.
4. **When nobody does a job** (a church with no buildings team): its pages go to master admins, recommended. Or are they hidden?
5. **A team's name and its id:**
   - **Recommended:** a team's id never changes, and only its label is shown. EGBC's ids stay as they are (today's names), so renaming "Church office" to "Admin" changes the label only. A new church's teams get ids that aren't names.
   - **Or:** the id is the name, as today, and a rename moves everything.
6. **The caps:**
   - **Recommended:** no fixed caps, except the most a document can safely hold (500), and one real setting (sites per screen page, default 3).
   - **Or:** each cap becomes a setting.
7. **Who does "Your teams":**
   - **Recommended:** the church's first master admin, on first sign-in, before anything else, as a short step they can come back to.
   - **Or:** Church HQ staff, when adding the church.

## H-10. Already built, would fail the synthetic parish test (23 Oct 2026)

**The test:** "St Aidan's with St Hild, Testbury (synthetic)", a C of E parish set up through the screens only (reviewing window; outline in OneDrive "New hub\Synthetic church test"). Below is what is already built in v2 that would fail it, and the step that fixes each. The counts come from `tools/find-egbc-words.cjs` (words a person could see; comments, file names and code names left out).

1. **EGBC's name, town, address and denomination shown as words: 72 files.**
   - "EGBC" 131 times in 55 files; "Esher" 17 in 13; esherchurch.org and esherchurch.github.io addresses 36 in 23; "Baptist" 14 in 11.
   - The worst: Planner.html, trainingrotaplanner.html, hub-app.js, rotaplannerinstructions.html, functions/rota-feed.js (calendar entries say "EGBC: …"), SundayServicePlanner, youthserviceplanner, hub.html, notifications.html, egbc-shell.js, login.html.
   - **Fix: a new step, "the church's identity".** Name, short name, town, logo, colours, web address and denomination come from `churchSettings/details` through one EGBCAuth helper (on the server, the church's own details through `churchOf`). A check fails on any of these words in code.
   - Owners: mostly main; the events window's and Comms' pages get a list.
2. **Team names typed into code: 95 files.** Fix: H-9 (team jobs), waiting for Martin's answers.
3. **Baptist and EGBC habits typed into code:**
   - **"Members' meeting"** (16 times in 5 files: church-meeting, egbc-starters, enews, addressbook, functions/meetings). A parish has its APCM and PCC meetings instead. Fix: the meeting's name and who may vote become church settings, part of the identity step.
   - **The rota's event types** (egbc-core-rota.js: 12 fixed types, from "Sunday Morning Worship" to "LOUD Worship") and their **fixed times** (08:00–11:30 Sunday, 19:30–21:30 practice) and **roles** (Worship Leader, Keyboard, Drums…). A parish needs 8am Communion, 10am Parish Eucharist, Evensong and midweek services, with servers, sidespeople, choir and organist. Fix: **a new step, "services and rota roles"**, kept per church with EGBC's lists as its defaults. Main's.
   - **One Sunday service.** The rota, the hub card, What's on and the calendar feeds assume one Sunday morning. Fix: the same step, with several services per Sunday across buildings.
   - **Core Team covers Worship and AV** (the rules' worshipAv(), CORE_COVERS in egbc-auth.js). Fix: H-9, with "leadership covers these jobs" as part of the mapping.
4. **Limits that would cut off a bigger church's data:** in H-9 (9 rules caps, 22 files with queries of at most 30 values).
5. **New-church setup doesn't exist yet.** Today a church is made by a script (step 1's directory). Fix: **step 4 part 3, "set up a new church", through the screens only.** It covers the church's details and logo (**the hub's address is required**: setup can't finish without it, since emails and links don't work while it is empty; the minister's title is asked, empty meaning "minister"), Your teams (H-9), the buildings and rooms, the services, and the first master admin, and it makes the church's users records by the server (H-8: a church's sign-in can't write its own).
6. **Cross-church data:** covered by steps 2–4 (2,398 cross-church rules checks, check-church-calls 97, the code index). Batches 7 and 8 (the events window's and Comms' functions) are still to do.

**How the parish would fare today:** it couldn't be set up through the screens (5). It would see "EGBC" and Esher addresses on most pages (1), and Elders, Kids Church and Church office (2). Its rota would offer Baptist worship types at EGBC's times (3). Its data would stay its own (6).

### H-9, decided (Martin, via the reviewing window, 23 Oct 2026)

1. **All 14 jobs, plus a 15th, `communications`:** the e-news, social posts, the card maker, Canva and Unsplash.
   - EGBC maps it to Church office, so EGBC sees no change.
   - Comms' files use `communications` where they mean whoever sends things out, and `office` only where they really mean the office. The split is to agree with Comms.
2. **Groups that work with under-18s** (Lazers, ReNu, a parish's Junior Church, Messy Church, a choir school) are a tick on each group, not jobs. The `children` and `youth` jobs stay, for whoever leads that ministry overall.
3. **Several teams per job are allowed** (such as a buildings team per site). Each rule change is measured against the expression limit (H-8).
4. **When nobody does a job,** its pages are hidden, and master admins see "Nobody does this yet: choose a team".
   - **Except pastoral care and safeguarding, which never fall back** to master admins or the office.
   - With no pastoral team, care requests stay closed until one is named, as the pastoral routing rule already says.
   - Safeguarding stays with the named lead and deputy only.
5. **Team ids stay fixed;** only the label changes. EGBC's ids stay as today's names.
6. **No fixed limits** beyond what a document can hold (500).
   - Sites per screen page is the one real setting.
   - Lists cut short on purpose say so on the page.
   - The 22 query sites hitting Firestore's 30-value limit are batched.
7. **"Your teams"** is done by the church's first master admin on first sign-in. Church HQ staff can do it for them on request.

**Order:** finish batch B (H-8: the F-279 rerun, then storage.rules); then the mapping and main's 61 files; then tell the events window and Comms.

## H-11. Several services a day, and the church's own service roles: the plan (23 Oct 2026)

**From ChurchShow's check against the synthetic parish** (churchshow F-CS18, 2d05baf). This is the "services and rota roles" step named in H-10. **For review; nothing is built.**

**Today:**
- A service's plan and its rota are one rota event (`events/{id}`: date, type, start time, an optional building, the assignments, the order of service).
- Several events can share a date already. But whatever looks a service up **by date** takes one: ChurchShow takes the first plan, and the rota card picks the busiest.
- The building is optional, and the team slides name "Service Leader" and "Worship Leader" in code.

**The plan:**
1. **A service is its event:** date, start time and building, with its own rota (the assignments already are). Every "by date" lookup is changed to return the day's services, in time order, each with its building.
   - **With one service on a Sunday, which is EGBC, every screen looks as it does now.**
2. **ChurchShow:** a paired computer already belongs to a building (`siteId`). A new callable, `churchShowServicesToday`, gives that building's services today. ChurchShow shows the next one starting and lets the operator pick another.
   - The church comes from the computer's sign-in: since step 3, a church's computer carries `churches: [cid]`.
3. **The church's own service types** (church setting `serviceTypes`). Each type has a name, a usual time, a building, its teams (by job, H-9) and its roles.
   - EGBC's twelve are the defaults.
   - A parish adds "8am Holy Communion (BCP)", "10am Parish Eucharist", "Choral Evensong" and "Wednesday Communion".
   - The rota's "+ Service" and the new-event form offer the church's list.
4. **The church's own service roles** (church setting `serviceRoles`), in the same spirit as the team jobs:
   - which roles a service has: President, Preacher, Intercessor, Reader, Organist, Servers, Sidespeople; or EGBC's Service Leader, Worship Leader, Speaker;
   - which appear on the team slides;
   - which come from a team's rota (Organist from the choir; Servers from the servers).
   - EGBC's lists are the defaults.
5. **Per-church data for ChurchShow:** when pages and ChurchShow read `churches/{cid}/…` (step 4 part 2, a church-scoped db), ChurchShow follows, taking the church from its pairing. **I'll tell the ChurchShow window when the paths are fixed;** its N2 and N3 wait for that.
6. **ChurchShow's two caps,** for H-9's audit:
   - **20 lesson groups per computer** (functions/churchshow.js, twice): no fixed limit, under H-9's decision (up to 500).
   - **12 questions in the planner's quiz box** (session-planner.html:530; and 12 programme links at :599): 50 each, a real quiz's length (see question 4).

**Questions for Martin** (recommended answer first):
1. **A service is known by its date, start time and building,** and a service with no building is at the church's main building. Agreed?
2. **ChurchShow on a building's computer:**
   - **Recommended:** it shows the next service starting in that building, with the day's others to pick from.
   - **Or:** the operator always picks.
3. **Service types and roles** are set up in the new church's setup ("Your services", after "Your teams"), changeable later in Church settings, with EGBC's lists as EGBC's defaults. Agreed?
4. **The quiz box:** up to 50 questions? Or no limit beyond what a document holds (about 500 short questions)?

**Order:** after H-9's mapping (the roles name teams by job), and before the new-church setup screens, which include "Your services".

**For the synthetic parish:** 8am in the old church, 10am Parish Eucharist, Choral Evensong, and Wednesday Communion in the chapel. Each has its own rota and roles (President, Preacher, Organist, Servers, Sidespeople). Each building's ChurchShow computer shows that building's next service.

### H-11, item 0: the plan of a service is found by date only. A bug for EGBC too (23 Oct 2026; the reviewing window and ChurchShow's F-CS18)

- **The bug:** the planner lets you choose between several services on one date (`spEventSelect`), but the plan is saved and loaded by **date only**:
  - egbc-core-planner.js:1104 saves to the first `services` document with that date, or adds one;
  - :985 loads the same way.
  - The saved plan has no link to the chosen rota event, and the emailed plan (`songSummaries`) is keyed by date too.
  - **So a morning and an evening service on one Sunday share one plan, and saving one overwrites the other.** The original site did the same (CoreTeamApp.html:1565/2228/2296, youthapp2.html:1616/1668), so it isn't a v2 regression. But it breaks the several-services feature.
- **The fix:**
  - **Each plan belongs to its service:** `services/{id}` gains `eventId` (the rota event), alongside its date, time and building, and is saved and loaded by `eventId`.
  - `songSummaries` follows: keyed by the event, as `<date>_<eventId>`.
  - **A date with one service behaves exactly as now:** a plan with no `eventId` is that day's plan, until it's next saved.
- **Existing plans:** EGBC's plans (one per date) get their day's single service's `eventId`. Two or more services on a date get listed for a person to choose.
  - This is a **dry-run script for Martin** (a live write): list, then apply. I won't write live myself.
- **Readers that follow,** by owner:
  - **main:** egbc-core-planner.js, hub-app.js (the hero card), app.html, CoreTeamApp.html, SundayServicePlanner.html, youthserviceplanner.html, youthapp2.html, worshiphubapp.html, song-summary.html, sundayplannersonglibrary.html, Library.html, Performancenotes.html, MonitorStageMap.html, data-tools.html, egbc-plan-audience.js, "training Sunday planner.html";
  - **ChurchShow** (functions/churchshow.js, churchshow.html): `churchShowServicesToday` (item 2 above), with the plan by `eventId`; the ChurchShow window changes its side;
  - **the events window:** Present (a deck's context date);
  - **Comms:** the e-news "This Sunday" and sitemaker.html.
- **Order:** this goes ahead of the rest of H-9, as an EGBC bug fix. It needs no team jobs.

**Question for Martin:**

5. **A plan saved before the fix, on a date with two services:**
   - **Recommended:** the migration lists it, and Martin or the office picks which service it was for.
   - **Or:** it goes to the earliest service that day.

## H-12. The church's own membership words and meetings: the plan (25 Oct 2026; Comms, a4e1cdbc)

**For review; nothing is built.**

**Today:** "Church member" is the name of an access level (the address book's tick, `churchMember`). "Church members' meeting" is the name of the members' meeting: the CMM video room, the e-news starter and the papers emails. 25 places in v2 use these words. They are Baptist habits; a parish has the electoral roll, the APCM and PCC meetings.

**The plan:**
1. **The access level stays; only its words change.**
   - The tick is still `churchMember` in the data and the rules.
   - Every word a person sees comes from a church setting, `churchSettings/details.memberWord`.
   - EGBC's default is "Church member", so EGBC sees no change; a parish might say "On the electoral roll".
2. **The church's meeting types, as a church setting** (`meetingTypes`). Each has:
   - a name;
   - who may come: members only, everyone, or a team by job (H-9);
   - who may vote;
   - who runs it (by job).
   - EGBC's one default is "Church members' meeting" (members only, members vote, run by office and trustees). A parish adds the APCM (everyone on the roll; the roll votes) and a PCC meeting (the PCC only).
   - The CMM room, the members' meeting page and the starter and papers emails take the meeting's name and audience from its type.
3. **In setup:** both go in "Your church", next to the church's name and details (before "Your teams").
4. **Owners:**
   - main: the setting and its helper, `EGBCAuth.memberWord()` and `EGBCAuth.meetingTypes()`, plus my pages;
   - Comms: the starter and papers emails, using the helper;
   - the events window: any page of theirs that says "member".

**Questions for Martin** (recommended answer first):
1. **The member word:** one setting, used everywhere ("Church member", "On the electoral roll", "Member"). Or two: the person ("member") and the list ("membership", "electoral roll")? Recommended: two, since a parish says "on the electoral roll", not "an electoral roll".
2. **Meetings that vote:**
   - **Recommended:** the members' meeting's votes and proxies work for any meeting type marked "votes", with who may vote taken from the type.
   - **Or:** voting stays for one meeting type only.
3. **The CMM video room:**
   - **Recommended:** one room per voting meeting type, named after it.
   - **Or:** one shared "meetings" room.

**For the synthetic parish:** "On the electoral roll" on its address book and access levels. An APCM and PCC meetings, each with its own room, papers and starter email. Nothing says "members' meeting".

### H-11 item 0, built: each plan belongs to its service (25 Oct 2026)

- **`egbc-plan-store.js` (new): the one helper every planner uses.** Name it in other windows' work: `EGBCPlanStore`.
  - `inOrder(events)`: the day's live services, in time order; archived ones don't count.
  - `label(ev, n)`: the type alone with one service, and the type with its time with several.
  - `planFor(docs, eventId, dayEvents)`: this service's plan. An older unlinked plan counts only on a one-service date.
  - `saveTarget(...)`: where to save, never over another service's plan.
  - `summaryId(date, eventId, dayEvents)`: the emailed plan's name, the date alone with one service.
  - `migrationPlan(...)`: used by the migration.
- **The new field:** `services/{id}.eventId` (the rota event). `songSummaries` documents carry it too, named `<date>_<eventId>` only when a day has several services.
- **v2 pages changed** (every one that saves or picks a plan loads the helper):
  - CoreTeamApp.html: its own "Create service", the plan list's labels, and "Fix duplicates", which now groups by service. Before, it would have deleted the second service's plan.
  - SundayServicePlanner.html, youthserviceplanner.html, youthapp2.html, "training Sunday planner.html".
  - egbc-core-planner.js (the app's and CoreTeamApp's planner).
  - app.html (the hero card, and "plans I'm on").
  - hub.html with hub-app.js (the Sunday card).
  - Performancenotes.html (its existing service picker); MonitorStageMap.html (writes the monitor settings onto the right plan).
  - song-summary.html (a plan's name may be date_service).
- **Also fixed on the way:** every planner listed one service per **type**, so an 8am and a 10am of the same type showed as one. Now every live service is listed, in time order.
- **One service on a date (EGBC almost every week) looks exactly as before:** the same labels, the same plan, the same emailed-plan name.
- **Not changed, and why:** worshiphubapp, Library and sundayplannersonglibrary read every plan and count songs, so two plans on one date are both counted, which is right.
- **The migration, `tools/link-service-plans.mjs`,** is for the reviewing window to run.
  - The dry run writes nothing and prints each plan → its service, and anything it can't place.
  - `--apply` backs each plan up to `servicesBackups/<planId>_<time>`, then adds `eventId` and nothing else.
  - Running it again changes nothing. Archived services are ignored.
- **Checks:**
  - check-plan-store: 17/17. Break: the old "first plan for the date" rule, 3 red.
  - check-two-services: 30/30 in a browser, across the shared planner, the Sunday planner and the Youth planner. Break: the old rule, 9 red (the evening overwrites the morning in all three).
  - check-link-service-plans: 13/13 on the spare emulator. Break: archived services counted, 5 red.
  - Still passing: check-emailed-plan 66/66, check-stamps 11/11.
  - check-core-planner: 69/72. The 3 reds (the Meetings room list) fail the same way on the code before this change; they're older, and I'm looking into them separately. **Found (4c7ebc1a):** the check read CoreTeamApp's list while the church's rooms were still being made (the emulator waits 16 s and more for the Daily secret). The list now says "Finding the rooms…", and the check waits for the rooms: 73/73; break 4 red.
- **The original site (from its root pages in git):** after v2 saves two plans on one date, a root planner shows whichever the database gives first, and saving there writes into that one. So EGBC shouldn't plan two services on one date with the original site's planners.
- **Other windows switch to `EGBCPlanStore` too:** the events window (Present), Comms (the e-news "This Sunday", sitemaker.html), and ChurchShow (`churchShowServicesToday`, H-11 item 2).

### H-11 item 2, added (25 Oct 2026; ChurchShow's N2): the church's words go to ChurchShow at pairing

- **`churchShowServicesToday`** uses `EGBCPlanStore` and each plan's `eventId` (item 0). For the computer's building it gives the day's live services in time order, each with its own plan.
- **ChurchShow's words come from the church, at pairing** (ChurchShow's suggestion), so a parish never types them.
  - `churchShowRedeem`'s answer gains `words`: the hub's name (`churchSettings/details.name`); the word for the main service day ("Sunday"); and the name of each group whose lessons the computer shows (Junior Church, Messy Church…, from Teams and groups; H-9).
  - They are refreshed with the job (`churchShowSetJob`), and on each sign-in renewal through a small callable `churchShowWords`.
  - **EGBC's defaults are today's words, so EGBC's ChurchShow shows no change.**
  - The pairing answer's shape gains a field and loses none, so ChurchShow can read it whenever it is ready.
- **Order:** with the rest of item 2, after H-9's mapping (the group names come from it).

## H-13. Storage: anyone can upload to `kb/` (25 Oct 2026; found while porting the Storage rules)

- **What:** in `storage.rules`, `match /kb/{page}/{fileName}` allows `write` with no sign-in check: any video or image under 500 MB, from anyone on the internet. Deleting is off, so nothing can be removed, but the bucket can be filled and billed. Reading is public, so an upload is also a public link on EGBC's bucket.
- **Who uses it:** the How-to and Play-through pages (`egbc-kbupload.js`, `kb/howto-av`, `kb/playthrough`). Their people are signed in.
- **In the church ruleset (batch B):** the same rule, behind the church gate. The gate lets a signed-out request through to what is public, so the hole is there too, once per church.
- **Not changed.** It is a live behaviour, and the rules go live only when the hub goes live. **Suggested:** `request.auth != null` on the write (the uploading pages already sign in), or an admin of the page's team. Martin to decide; it would be one line in `storage.rules` and both rulesets are rebuilt from it.
- **For the synthetic parish:** with the suggestion, St Aidan's How-to pages work as now for its signed-in people; a stranger can't put files in St Aidan's bucket space.

## H-14. A Permissions screen, by section, with exceptions: the plan (26 Oct 2026; Martin, via the reviewing window)

**For approval; nothing is built.** Mock-ups for Martin in `design-mocks/permissions/`: `permissions-1280.png` and `permissions-375.png` (the screen), and `exceptions-1280.png` and `exceptions-375.png` (the exceptions list, and adding a person). Made-up people.

**Martin's words:** "only admins and core team should be allowed to upload. This needs setting up on the permissions screen." "Split down by section, so it is easy to find… 'permissions' and then a tick box. But we also need an exceptions rule."

### The screen (Church settings > Permissions, master admins only)

- **By section, never one long list:**
  - the sections are Worship & AV, Children & youth, Events & rooms, Communications, Money, Buildings and Office & admin;
  - each section is closed until tapped, and shows how many actions and exceptions it holds;
  - a search box finds an action or a person.
- **Each action in plain words** (for example, "Upload to How-To AV, Play-Through and AV Troubleshoot"), with tick boxes for who may do it:
  - **master admins:** always ticked, and can't be unticked;
  - **jobs**, shown with the church's own team name ("Leadership · Core Team"; the parish sees "Leadership · PCC Standing Committee");
  - **teams**, under "Choose teams…";
  - **leaders of the teams ticked**.
- **Exceptions:** under each action, "+ Add a person" gives one named person that one action, and nothing else of a team's access.
  - Each exception shows who added it and when, an optional end date and a reason.
  - The "Exceptions" view lists them all, with "ends in 5 days" when one is about to end.
  - Each person's address book entry lists theirs.
- **History:** every change, with who made it and when, and what it was before.
- **Safeguarding and pastoral care are not tick boxes.** They show read-only: "Only the named safeguarding lead and deputy… Set on Safeguarding settings", and "Only the pastoral team. Set on Teams & groups". This is H-9's rule that they never fall back.
- **Actions not yet moved** show "Set in code today: moves here later", so the screen is honest from day one.

### How it works

- **One document per church, `churchSettings/permissions`:** for each action, `{ jobs, teams, leaders, people: { memberId: { by, at, until, why } } }`. Master admins aren't stored; they always may.
  - Only master admins write it, and the rules check its shape.
  - It's kept under 500 entries per list (H-9).
- **Defaults are EGBC's values, for every church.** The first action is `kbUpload`: master admins plus the leadership job (EGBC's Core Team), and no exceptions. A new church gets the same until it changes them.
- **Pages ask one helper,** `EGBCAuth.may('kbUpload')`, and show the upload control only to people allowed. The page's own words are unchanged.
- **The rules: a claim, not a lookup** (recommended).
  - When the permissions document, a person's teams or an exception changes, a server function works out each affected person's allowed actions and puts them on their sign-in, as `perms: { <cid>: ['kbUpload', …] }`. It runs beside `hqMembershipClaims`, which already does this for `churches`.
  - `storage.churches.rules` then allows a kb/ write only if `'kbUpload' in request.auth.token.perms[cid]`.
  - That costs a few expressions and no document reads. A rules lookup of the document plus the person's teams would cost two or more reads per upload and grow with every team ticked (H-8). I'll measure both before choosing.
  - Exceptions with an end date are taken off by the daily job on that date.
- **When a change reaches people:** the next time a page opens (the page refreshes the sign-in when the server says it has changed), within a minute.
- **The rules go live with the hub,** as always. Until then the original site's kb/ uploads keep working, and nothing of the original site changes (GOING-LIVE.md, updated).

### The gates that move here over time (not now)

Listed by owning window, from today's code: calls to `inTeam`, `isLeaderOf`, `isAdminOf` and `hasRole`, the Menu's `leaderOf`, `data-role="leader"`, and the rules' `onTeam()`.

- **Main** (about 60 gates in 17 files):
  - the Menu's `leaderOf` (egbc-menu.js, 12): the rota planner, Sunday service plan, Music Uploader, and the AV leaders' pages;
  - hub-app.js (12) and app.html (4): the hub's and app's cards;
  - the kb upload gate, egbc-kbadmin.js: today master admins or admins of the page's team. This is the first to move;
  - addressbook, stickynotes, videos, resources, preaching-plan, inventory, music-uploader, batchupload, planner, SundayServicePlanner, church-settings;
  - egbc-auth.js's own helpers, which become `may()` underneath.
- **Events window:** safeguarding.html and safeguarding-risk.html (these stay with the lead and deputy, so they're read-only rows), catering.html, payments.html, and their sections of firestore.rules (`onTeam()`, 27 uses across all windows' sections).
- **Comms:** egbc-comms.js and EmailBuilder2.html (who sends the e-news and team emails).
- **Each window moves its own gates** when it next touches that page, one action at a time. Each gets a row on the screen first, then the code asks `may()`, with a check and a break.

### Where it goes in H-9's order

1. H-9 part 1, **the mapping** (jobs to the church's teams; `onJob()`).
2. **H-14 part 1, this screen,** with its first action, `kbUpload`, end to end (the screen, the claim, the page control, the church Storage rule, checks with breaks). It needs the jobs, and it's small enough to prove the pattern.
3. H-9 part 2, **main's 61 files.** Main's gates move onto the screen as each file is touched.
4. **Tell the events window and Comms,** with their gate lists above.

### Questions for Martin (recommended answer first)

1. **"Admins and core team" for kb/ uploads:**
   - **Recommended:** master admins, plus the leadership job (Core Team), plus the admins of AV and Worship. The second and third are what v2's upload gate does today.
   - **Or:** master admins and Core Team only (the reviewer's default).
2. **Exceptions only add.**
   - **Recommended:** an exception gives one person one more action. To take an action away from someone, change their team.
   - **Or:** exceptions can also take one action away from a person whose team has it.
3. **End dates:**
   - **Recommended:** optional, none by default. A week before one ends, the master admin who added it gets a note.
   - **Or:** every exception has an end date, 12 months by default.
4. **"Leaders":**
   - **Recommended:** leaders of the teams ticked for that action.
   - **Or:** leaders of any team.
5. **Who may change permissions:**
   - **Recommended:** master admins only.
   - **Or:** master admins and the office job.
6. **Where it lives:**
   - **Recommended:** Church settings > Permissions, with a Menu entry for master admins.
   - **Or:** a page of its own under Menu > Admin.

**For the synthetic parish:** St Aidan's master admin opens Permissions and sees "Upload to How-To AV…" ticked for master admins and "Leadership · PCC Standing Committee" (its leadership team, from Your teams). They add the verger as an exception "until Easter", with the reason "runs the sound desk". The verger sees the upload button; nobody else from the congregation does. A stranger can't upload once the hub is live.

## H-9 part 1, built (26 Oct 2026): the jobs and who does them

- **`egbc-team-jobs.js`** holds the 15 jobs (with `communications`), EGBC's teams for each, and suggestions for a new church. It also gives the answers: `teamsFor`, `onJob`, `label`, `validate`. `functions/team-jobs.js` is built from it by `tools/team-jobs-build.mjs`, so there is one source.
- **Stored in `churchSettings/teamJobs`:** `{ <job>: [team ids] }`. Nothing stored means EGBC's team (or the setting the job already had: moneyTeam, trusteeTeam, prayerTeam), so **EGBC sees no change and nothing is written**. `[]` is "nobody".
- **Rules:** only master admins write it, only the 15 jobs, each a list of at most 500.
- **Teams & groups gains "Who does each job":** a team for each job, several allowed, "Nobody does this yet: choose a team". Pastoral care with nobody says care requests stay closed.
- **Not yet:** nothing asks `onJob()` yet. That's part 2, main's 61 files.
- **For the synthetic parish:** its PCC are its trustees, its Fabric team and St Hild site team do buildings, and with no AV team nobody is on AV.

## The hub's address, made not typed; egbc.churchhq.co.uk (26 Oct 2026)

- **`functions/hub-address.js`:** a church's address is `https://<slug>.churchhq.co.uk/`.
  - The slug is chosen at setup (3–40 lowercase letters, numbers and single hyphens; unique through `hqSlugs`; checked as typed by `hqSlugCheck`). The church id is used until one is chosen.
  - EGBC keeps `EGBC_HUB` (github.io) until it switches; Daily's and Microsoft's constants read it too.
  - Church HQ staff change a slug with `tools/hq-set-slug.mjs` (dry run first; the old one is kept, retired).
- **Church details shows it read-only** with a copy button and "ask Church HQ". The typed field from 42cc2a8d is gone, and no page may set `details.hubUrl`.
- **egbc.churchhq.co.uk:** a Cloudflare Worker, `tools/cloudflare/` (README in plain steps). On that address sign-in runs through `/__/auth/`, the manifests open on that address (their `start_url` and `scope` are relative now, the same on github.io), and page-built email links use the page's own address.

## H-15. Core teams cover chosen teams, independently: the plan (26 Oct 2026; Martin's bug, via the reviewing window)

**For approval; nothing is built.** Martin: "We need a kids church and youth core team and a worship core team. They need to be independent." Comes **before H-9 part 2**, which would otherwise build on the wrong "leadership".

### What happens today
- **EGBC's "Core Team" is the worship team's core team.** egbc-auth.js (`CORE_COVERS`) and the rules (`worshipAv()`) already widen it to Worship Team, AV Team and Choir only. Those two are right.
- **The leaks are hand-written lists that name Core Team as if church-wide:**
  - the Menu's Rota planner (`leaderOf`, egbc-menu.js:87) and rota reports (`adminOf`, :106);
  - the hub's Rota planner and Events entries (hub-app.js:2469, :2489);
  - the rota's scoping (`WORSHIP_SIDE` in egbc-auth.js, which also gives Core Team the Youth rota);
  - the server's send lists (`ROTA_TEAMS` / `PLAN_TEAMS`, functions/hub-send.js:47–48);
  - H-9's `leadership` job ("runs Sundays across teams").
- **What Martin saw:** on the hub's Home choice ("Home shows: Core Team"), a master admin still counts as being in every plan group, so the Sundays card listed Kids Church's Session planner and Present. For an ordinary Core Team member, the Rota planner opens every team's rota, Kids Church's included.
- **egbc-core-rota.js:1252 is not access.** It's the list of teams an event can be tagged for (a Core Team meeting, for example), so it stays.

### The plan (any church)
1. **A core team covers chosen teams.** On Teams & groups, any team can be ticked "core team for" a list of teams (stored on the team as `coreFor: [team ids]`; master admins set it).
   - Being on a core team counts as being on each team it covers, and nothing else.
   - Its leaders and admins count as leaders and admins of those teams, as Core Team's do today for Worship and AV.
   - Core teams are independent: none covers another, or anything outside its list.
2. **EGBC's defaults, so nothing is lost:**
   - **Core Team**, shown as "**Worship Core Team**" (its id stays "Core Team", H-9), covers Worship Team, AV Team and Choir, exactly as today.
   - **A new team, "Kids & Youth Core Team"**, covers Kids Church, Lazers, ReNu and Youth Worship. Martin puts its people in.
3. **One answer everywhere:** `EGBCAuth.inTeam(team)` and `isLeaderOf(team)` ask "on it, or on a core team covering it". Every hard-coded "Core Team" in the lists above goes, because the cover now gives each core team its own pages.
   - A Worship Core Team member keeps Worship & AV and the Rota planner, scoped to Worship, AV and Choir. They no longer get the Youth rota, Kids Church's rota, the Session planner or Present.
   - A Kids & Youth Core Team member gets Kids Church's, Lazers', ReNu's and Youth's pages and rotas, and none of the worship ones.
   - Master admins still see everything in the Menu. **But on the hub's Home choice, the hub's lists show the chosen team's pages** (with what it covers), even for a master admin. That's the fix for what Martin saw.
4. **The rules, without a new read** (H-8): the server keeps each person's covered teams on their users record (`covers`). The rules' `myTeams()` becomes their teams plus `covers`, and no page can write `covers`. Until it's written, Core Team keeps today's `worshipAv()`, so nothing changes on the day.
5. **H-9: no church-wide "leadership" job** (question 2). Ministry leadership comes from core teams.
6. **H-14:** kb/ uploads default to master admins, plus **the core teams covering worship** (EGBC's Worship Core Team), plus the admins of AV and Worship. A new tick on the Permissions screen, "core teams covering…", says it for any church.
7. **Checks:** in a browser, signed in as a plain Worship Core Team member and a plain Kids & Youth Core Team member (made-up people, not master admins). They cover the Menu, the hub's lists, the app's tiles and the rules (each core team reaches its own teams' data and not the other's). There are breaks for "covers ignored" and "Core Team covers everything".

**For the synthetic parish:** "Ministry Team" covers the Choir and Music group, and "Children's Ministry Team" covers Junior Church and Messy Church. Each sees only its own. The PCC are trustees, and covers nothing.

### Questions for Martin (recommended answer first)
1. **Does the Kids & Youth Core Team work with under-18s** (DBS needed), since it covers Kids Church and Youth?
   - **Recommended:** yes. A core team covering an under-18s team is itself marked as working with under-18s, so its people need the same checks.
   - **Or:** no, it's only for planning.
2. **H-9's "leadership" job:**
   - **Recommended:** drop it, leaving 14 jobs. Leadership of each ministry comes from its core team.
   - **Or:** keep it as "the church's overall leaders" (EGBC: Elders), covering nothing.
3. **A Kids & Youth Core Team space in the app,** like Core Team's (plan, rota, meetings, charter):
   - **Recommended:** not now. They get the Kids Church and Youth spaces through the cover. Add a space later if they ask.
   - **Or:** build it now.

**Order:** this (H-15), then H-14 part 1 with the new kb/ default, then H-9 part 2.

### H-15, built (26 Oct 2026; Martin's answers: 1 yes, 2 keep leadership as the overall leaders, 3 no space for now)

- **Core teams:** a team's `coreFor` (Teams & groups, "Core team for", master admins only; the rules refuse the office changing it).
  - EGBC's defaults are in egbc-auth.js and functions/core-teams.js:
    - **Core Team, now labelled "Worship Core Team",** covers Worship, AV and Choir.
    - **The new "Kids & Youth Core Team"** covers Kids Church, Lazers, ReNu and Youth Worship. It works with under-18s, in both lists (check-under18-teams-agree 5/5).
    - On live, Core Team's saved label may still say "Core Team"; Martin can rename it on Teams & groups.
- **One rule everywhere:** `inTeam`, `isLeaderOf`, `isAdminOf`, `adminAreas`, the leader gate and the rota's teams all use the core teams' own lists. `CORE_COVERS` is gone.
  - The Menu's Rota planner and rota reports no longer name Core Team. `core: true` means "on any core team", and Core Team's charter is Core Team's own.
  - hub-send's rota and service-plan senders use the church's core teams.
  - The hub's old page list no longer names Core Team.
- **The hub's Home choice:** with a team chosen, the Sundays card shows that team's jobs (with what it covers), even for a master admin. That's what Martin saw. The Menu still has everything.
- **The rules:** `myTeams()` adds `covers`, and `adminOf()` adds `adminCovers`. The server keeps both on each users record (`coversOnUser` and `coversOnTeam`, for EGBC and every church), and no page may write them. Core Team keeps `worshipAv()` until its record has covers.
- **H-9's jobs:** `leadership` is the church's overall leaders (EGBC: Elders) and covers nothing. No job covers another. Suggestions: leadership is Elders, Deacons, PCC, Staff team, Leadership team; office is Church office, Parish office, Admin team.
- **H-14:** kb/ uploads default to master admins, plus the core teams covering worship (`coresOf: ['worship']`), plus the admins of AV and Worship.
- **Checks:**
  - check-core-teams 18/20, signed in as plain members of each core team. The 2 reds wait for the events window's planGroups rule (FINDINGS-events).
  - Its breaks: covers ignored, 6/20 (12 red beyond the 2 waiting); Core Team church-wide, 14/20 (4 beyond).
  - Rules 1947/1947; AS_CHURCH 1937/1947 (the 10 by design).
  - check-team-jobs 29/29 (breaks 4 and 2 red); check-team-jobs-screen 13/13; check-core-planner 73/73.
- **For the synthetic parish:** "Ministry Team" ticked as core team for the Choir and Music group, and "Children's Ministry Team" for Junior Church and Messy Church. Each sees only its own. The PCC are the overall leaders and cover nothing.

## H-16. One access matrix: who sees what, as the source of truth (26 Oct 2026; Martin: "can you check that the right things are for the right people across the hub? It isn't good I am finding these.")

**Plan; the generator is being built next.** It comes before the meetings work (which folds into it), because it stops these bugs coming back.

### What it is
- **One table, made from the code itself:** every page, Menu entry, Home card, app space and app tab, and who reaches each.
  - **People:** made-up people, one for each kind of person (below), signed in on the emulator. Nothing is guessed from reading the code.
  - **For each person:**
    - **Menu:** what `EGBCMenu.forPerson()` offers;
    - **Home:** the hub's cards that draw;
    - **App:** `EGBCApp.spacesFor()`, and each space's tabs;
    - **Page:** each page opened; does its guard let them in, or put up the "not for you" card?
- **The people (synthetic):**
  - pending; attender; member on no team;
  - a member, then a leader, of Kids Church and of Worship Team; an AV member;
  - Worship Core Team; Kids & Youth Core Team;
  - Church office; the overall leaders (Elders); the money team (Finance); the pastoral team;
  - a safeguarding lead on no team; a site's bookings admin; a small group leader; a plan group leader;
  - a master admin.
- **Out:**
  - `tools/access-matrix.mjs` writes `access-matrix.json` and **ACCESS-MATRIX.md**: a readable table for Martin, by Menu section. Rows are pages; columns are the people; each cell says ✓ (offered and let in), – (neither), **⚠ offered but refused**, or **◐ let in but not offered**.
  - Every ⚠ is a bug by definition. Every ◐ is either a page reached from elsewhere (said so in the table) or a bug.
- **Approved once:** Martin marks the table. The approved copy (`access-matrix.approved.json`) becomes the source of truth.
- **The check:** `tests/check-access-matrix.mjs` builds it again and fails on any difference from the approved copy, and always on a ⚠. Breaks: a Menu entry opened to everyone; a page guard dropped; a Home card shown to everyone.
- **Then the fixes, window by window,** each turning a row green:
  - main: the Menu, the hub, the app, its own pages;
  - the events window: the kids pages' and safeguarding's guards;
  - Comms: its pages.
- **The audit's 29 "access" reds** are this same question asked page by page, so they fold in here.
- **Long term:** each row's rule moves onto the Permissions screen (H-14) as its action, where one fits.

### Proposed changes, from the reviewing window's findings (each a row in the table, marked "proposed")
1. **Meetings:** not offered to everyone (see the meetings plan: a non-admin sees only the meetings they're invited to; more is a permission; master admins see all).
2. **The hub's PAGES `everyone: true`** goes from Worshipteamcharter, EGBC-PlayThrough, EGBC-Training-Worship, batchupload (Music Uploader), EGBC-HowTo-AV, EGBC-Troubleshoot-AV, Youthcharter, youthserviceplanner, stickynotes (done, 26 Oct), resources (Team Resources), videos (Team Videos) and meeting. These were the original portal's "everyone". In v2, sign-in level and teams decide.
3. **Children's register and Sunday check-in:** for the Kids Church leads only (helpers see their own group's children, Karen's guide), in the Menu and in the pages' guards (the events window's pages).
4. **Team Resources and Team Videos:** Worship & AV's only, if they're worship material (Martin to confirm).
5. **The Availability form:** for every rota'd team member, not only core teams.

### DECIDED by Martin (26 Oct 2026; in the table as decided, not proposed)
- **Every member:** Maintenance (report a repair), My evacuation plan, Hire our rooms.
- **Book a room:** core teams and team leaders only, not every member.
- **Preaching plan:**
  - **Assembled and edited** by the pastors and elders: the "leadership" job (EGBC: Elders) plus a "pastor/minister" role. The role is added if it is missing, and found through the jobs mapping (H-9), never by a team's name.
  - **Seen, read-only,** by whoever may use the Rota planner.
  - Nobody else.

**Done separately, 26 Oct:** pin boards are each team's own (not whole-church; no fallback to Worship's; boards come from the teams, set on Teams & groups). The rules still map each board to EGBC's teams, so a board regrouped on Teams & groups is refused there until the rules learn the grouping (going live).

**For the synthetic parish:** the same table, made for St Aidan's own teams. Its PCC, Junior Church and Ministry Team rows come from its Teams & groups, not EGBC's names.

### Progress, 26 Oct (main)
- **Step C exists:** `node tests/check-access-matrix.mjs` (dev emulators up). It fails on any page the Menu offers and the page then refuses, on any DECIDED rule the code breaks, and, once Martin has approved the table (`access-matrix.approved.json`), on any cell that differs from it. Its breaks (`BREAK=rooms`, `preaching`, `refused`) each fail.
- **Book a room, main's side:** the Menu and the app's What's on show it only to team leaders and core teams (`EGBCAuth.leadsOrCore()`: a master admin, anybody who administers a team, a role of leader or above, or on a core team). The guard has `data-leads` for the page. The page itself, and the rules for members' bookings, are with the events window (FINDINGS-events: "Book a room is for team leaders and core teams"), with the question whether office and bookings admins count.
- **Preaching plan, done:**
  - Editors (`EGBCAuth.preachingEditor()`): a master admin, the Pastor named in Team emails, and the teams on the "leadership" job (EGBC default: Elders).
  - Readers (`EGBCAuth.rotaPlannerUser()`): whoever may use the Rota planner.
  - The page turns everybody else away, and the Menu uses the same tests.
  - The rules let the leadership read and change the plan's four fields, like the Pastor (`isLeadership()`, from `churchSettings/teamJobs.leadership`). This has a test with a break.
- **Still to do:** the reviewer's proposals 1–5 once Martin approves the table (step B); then `access-matrix.approved.json`.

### Progress, 27 Oct (main): the reviewer's findings on the table (b9163c0f)
Each is in ACCESS-MATRIX.md's "Where the code differs" list, marked "(reviewer)" for Martin to confirm, and all now say "matches".
1. **Safeguarding lead and deputy.** The Menu was right; the made-up lead wasn't really a lead (the server's `refreshCareStatus` overwrote the matrix's direct write). The tool now names the person as deputy in the lead site's settings, as the office would. The lead now gets Safeguarding, Safeguarding risks and Safeguarding settings. **Due for deletion** moved to master admins only, because retention.html refuses everyone else. Break: `BREAK=deputy`.
2. **Availability form:** for anyone on a team with a rota (a team's `rota` setting; Church office, Finance and Elders are groups without one). Break: `BREAK=availability`.
3. **Finance:** Payments now shows (the money team setting; check-menu had left it changed). **Giving details** stays with the Church office and master admins, as Martin decided on 21 Oct. **Question for Martin:** should Finance have it too? **Gift Aid admin** is a section of Gift Aid, which Finance already opens. The rules give it to the office and to a team called "Finance", by name (asked of the events window).
4. **Events and ChurchShow:** a "leader" (a role) is not an admin. Admin means an admin area, or a core team covering that team. ChurchShow already matched the page; the table just had no admins in it. Worship, Kids and Core admins are now in the table. **Events (Menu):** core team and admin. The rules let any admin create an event. **Question for Martin:** should every team admin (for example the Kids Church admin) have Events?
5. **Check-in and Registers:** also the event's own team, on the Menu (the pages already allowed it). Break: `BREAK=checkin`. **Headcounts** stays with the kids admins.
6. **Meetings:** next.

Also on the Menu: **Health and safety settings** for the office job (it had no way in).

**Checks:** check-access-matrix 14/14 (its 6 breaks each fail); check-menu 105/105; check-stamps 11/11; check-rules-build 10/10. The hubresources.html phone audit has 0 failing.

## H-17. Meetings you're invited to; a meeting in a taken room gets its own (27 Oct 2026, main, 0dc83b7f)

Martin and the reviewer: a non-admin should see only the meetings they're invited to, with more as a permission that's never on by default. And Martin: "a link for a particular time should somehow say it is in use. If we have a small group link we could have 5 groups at the same time."

### Who sees which meetings

- **Invited** means one of these:
  - named on the meeting (its organiser, an invitee, or a role on it);
  - the meeting is for one of your teams, or a team your core team covers;
  - a members' meeting, which keeps its own rule (church members).
- **Every surface follows it:** Menu > Meetings (meeting.html), Core Team and the core-team spaces' Meetings, the hub app's meetings, and a pasted meeting address. Somebody not invited is told "Not one of your meetings".
- **Seeing every meeting** is the new permission `meetingsAll`, on the Permissions screen under Events. It's on for nobody by default; master admins see all. For example, give it to a small group leader who runs calls for several groups.
- **Hosting is unchanged.** The permission is for seeing and joining only.
- **The rota calendar feed** was already personal (`functions/rota-feed.js`).

### Rooms in use

- **Every scheduled meeting goes in its room as before.** If another meeting already has that room at an overlapping time, the hub gives the new one a room of its own: `functions/meeting-rooms.js`, triggers `meetingOwnRoom` and `meetingOwnRoomChurch`.
  - The meeting set up first keeps the standing room. Each meeting decides for itself against the others, so five set up in the same second still end with exactly one in the standing room.
  - An own room has its own Daily link, which ends a day after the meeting. It takes its hosts and its members-only setting from the standing room, and it's never listed as a standing room.
  - An own room is never moved back, because its link may already be in invitations.
- **"In use now: <meeting>, until <time>"** shows on the standing room in Meetings and in Core Team > Meetings.
- **Opening a room in use** by a meeting you're not invited to says it's in use and by which meeting (title only, never its link or host). If you are invited to that meeting, you're taken to it.
- **The person booking** a time that's taken is told their meeting has a room of its own, and where its link is.

### Checks (all with breaks)

| Check | Result |
|---|---|
| check-meetings-visibility: a plain member, Kids Church, Worship, K&Y core, a small group leader without and then with the permission, a master admin | 33/33; BREAK=all, perm and covers each fail |
| check-meeting-rooms-in-use: five small groups at once | 19/19; BREAK=order and inuse each fail |
| Rules suite | 2010/2010; church mode 2000/2010, the 10 by-design users self-writes (H-8) |
| check-permissions | 26/26 |
| check-access-matrix | 14/14 |
| check-meeting-host, check-meeting-teams | 19/19, 16/16 |
| check-stamps, check-rules-build | 11/11, 10/10 |

### For going live

- **The rules:** events stay readable by anyone on a team (the rota needs them). The pages filter what each person sees, and the `meetingsAll` claim adds a holder on no team. The rules go live when the hub goes live.
- **Room links** (`churchSettings/video`) are readable by the church. They are knock-to-join, and host tokens are never stored.
- **Deploy (the reviewer's or Martin's):** functions `meetingOwnRoom` and `meetingOwnRoomChurch`. They reuse `DAILY_API_KEY`; no new secret. Until they're deployed, two meetings at the same time in one room still share it, and the page warns the person booking.

### For the synthetic parish

At St Aidan's with St Hild, the small groups' room set up in Settings works the same way. Five groups booked for Wednesday 19:30 get one standing room and four of their own. A group member sees their own group's meeting and not the others'. The vicar (a master admin) sees all of them.

### Asked of Comms

`egbc-meeting-pick.js` (the meeting picker in the email builders) still lists every upcoming meeting to authors (FINDINGS-comms, 27 Oct).

### Progress, 29 Oct (main): step B, Martin's approval of the table (27 Oct)
- **Proposal 1, meetings:** done together with the meetings split (Martin: "fix it properly"), next after H-11. Until then `meeting.html` keeps its hub-page `everyone`.
- **Proposal 2:** `everyone: true` is gone from the hub's pages registry (hub-app.js) for Worshipteamcharter, EGBC-PlayThrough, EGBC-Training-Worship, batchupload, EGBC-HowTo-AV, EGBC-Troubleshoot-AV, Youthcharter, youthserviceplanner, resources and videos. resources.html is no longer one of the shared pages that "Mark shared pages" opens to everyone.
  - **Live data:** the live database's `hubPages` records may still carry `everyone`. Clearing those is a write to live data, so it's for going live.
- **Proposal 3, Children's register and Sunday check-in:** on the Menu for the kids leads only, as the pages already decide.
  - **Who counts:** an admin of a team named in a site's kids settings (or of the children job's teams when nothing is set), each kids group's leaders, and master admins.
  - **How:** `EGBCAuth.isKidsLead()`.
- **Proposal 4, Team Resources and Team Videos:** for the worship and AV jobs. That's the Menu entries, the pages' guards (`data-job="worship,av"`, `require({ job: 'worship,av' })`) and the hub's pages.
- **Proposal 5, Availability form:** already done (b9163c0f).
- **`access-matrix.approved.json` is made** from the table after these changes. check-access-matrix compares every cell with it and passes 15/15. Safeguarding risks' decision now includes group leaders, read only, as events added in F-304.

### H-11, built (29 Oct 2026; Martin's answers of 23 Oct: the recommended ones, no quiz limit)
- **`egbc-services.js` (new), `EGBCServices`:** the church's kinds of service and meeting, and the roles a service names, from `churchSettings/services`.
  - **EGBC's lists are the defaults:** the twelve kinds and two roles, as the rota has always made them. With nothing stored, nothing changes for EGBC.
  - A kind has a name, whether it's a service, its usual times, its building, its teams by job (H-9), and its rota places.
  - A role has a name, and whether it's on the slides. EGBC's Service Leader and Speaker stay fields on the event; any other role is `serviceRoles.<id>`.
- **"Your services"** (services-settings.html) is for the office and master admins, and has a Menu entry in Church admin. It's also the setup's "Your services" step.
  - It offers one-tap ideas in general words (Holy Communion, Choral Evensong, President, Intercessor…).
  - **Rules:** `churchSettings/services` is written by `raOffice()`; rebuilt. The preaching plan's people may also set `serviceRoles`.
- **The rota** (egbc-core-rota.js, used by the app and CoreTeamApp) and **Planner.html** now:
  - offer the church's kinds in "+ Service", the new-event form and each row;
  - make a new event from its kind (times, building, teams by job, places, What's on);
  - let "Populate term" and auto-fill use the church's first service;
  - show a building on each row when the church has more than one.
- **Planner.html's role inputs** are one input per church role (EGBC: Service Leader and Speaker).
- **The slides and the app's "Who is on"** take the church's roles (`EGBCAuth.slideRoles`). EGBC's slides and card look as before.
- **The preaching plan and the hub's Sunday card** list the church's services.
- **ChurchShow** (functions/churchshow-services.js):
  - **`churchShowServicesToday`** gives the computer's building's live services today, in time order, each with its own plan by `eventId` (functions/plan-store.cjs, copied from egbc-plan-store.js by tools/plan-store-build.mjs). It also says which is next. A service with no building is at the main building: `churchSettings/details.mainSiteId`, or else the first building by name.
  - **`churchShowWords`** gives the church's name, the service day and the names of its lesson groups.
- **Caps (item 6):** a ChurchShow computer's lesson groups go up to 500. A sign-in's claims carry only the first 20, because claims are 1000 bytes at most; the full list is in the device record and `churchShowWords`.
- **Asked of events:** the quiz box and programme links in session-planner.html, its own service list, and Present.
- **Not changed:**
  - SundayServicePlanner.html's four fixed inputs. It's EGBC's own worship planner; a parish plans in Planner.html.
  - "Add Thursday practices", which is EGBC's own button.
- **Quick check** (emulator, the synthetic parish), 14/14:
  - EGBC's defaults: twelve kinds, five services, a Sunday as the rota always made it, the Core Team Meeting, the slides.
  - A parish's kinds, buildings, teams by job, roles and slides.
  - PCC counted as a meeting.
  - ChurchShow: the main building's two services each with its own plan; the chapel's 8am only; the next service; the church's words.

## The setup frame (29 Oct 2026, main): a new church sets itself up on its own screens
- **Church HQ adds the church** (`tools/hq-create-church.mjs <id> --name … --admin-email … --admin-name …`; dry run first, then `--apply`). It writes:
  - the directory entry, `status: 'setup'`, and the slug;
  - the membership and the sign-in's `churches` claim;
  - the church's own `churches/<id>/users/<uid>`, with the first master admin;
  - their address book record, and `churchSettings/details.name`.
  Nothing at EGBC's top level. Running it again is refused.
- **Everything else is done on the church's screens.** `setup.html?church=<id>` (the church's master admins) lists the steps (`egbc-setup.js`, `EGBCSetup.STEPS`).
  - Whether a step is done is read from the church's own data, never ticked.
  - Each step opens an ordinary page with `?setup=1`. That page then shows a bar: "step n of N", all the steps, and the next one. egbc-auth.js loads it, so a step's page needs nothing of its own.
- **Which church a page is for (H-6 step 2, the part the frame needs):**
  - `?church=<id>` chooses it, and it's remembered on the device; `?church=egbc` forgets it. With none chosen (EGBC, and every page today) nothing changes.
  - A church the sign-in doesn't carry is forgotten, and the page opens again.
  - **`EGBCAuth.db` is then that church's data** (`churches/<id>/…`), with the same `.collection()`, `.doc()`, `.batch()` and `.runTransaction()`. A collection group is refused.
  - `EGBCAuth.call` sends `churchId`; `EGBCAuth.churchId()`; `EGBCAuth.churchLink(url)`.
  - Seven of my pages that made their own `firebase.firestore(EGBCAuth.app)` now use `EGBCAuth.db`: app, permissions, worried, teams-admin, pastoral-visits, privacy and care-inbox. Three training copies do too.
- **The steps, and who owns each page:**

  | Step | Owner | Page |
  |---|---|---|
  | Your church | Comms | to build |
  | Your buildings | events | to build |
  | Your teams (and their jobs) | main | teams-admin.html |
  | Your services | main | services-settings.html |
  | Your people | main | addressbook.html |
  | Who gets told | main | church-settings.html |
  | Safeguarding | events | safeguarding-settings.html |
  | Data protection | events | data-records.html |
  | Pastoral visitors (optional) | main | pastoral-visits.html |

  Each window keeps its own entries in egbc-setup.js (title, page, done check), as with stamps.
- **Still to port for church pages** (H-6 step 2, the rest):
  - the pages on the modular SDK with their own database: addressbook.html (the people step, mine, next), Planner, SundayServicePlanner, the youth planner, song-summary, view-only-rota, MonitorStageMap, Performancenotes and index (the availability form);
  - Storage paths.
- **Quick check** (emulator), 8/8: the dry run writes nothing; `--apply` makes the church's master admin in the church's own users and nothing at EGBC's top level; the sign-in carries the church; its name is in its details; the directory says setup; running it again is refused.
