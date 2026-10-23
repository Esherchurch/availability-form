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
5. **New-church setup doesn't exist yet.** Today a church is made by a script (step 1's directory). Fix: **step 4 part 3, "set up a new church", through the screens only.** It covers the church's details and logo, Your teams (H-9), the buildings and rooms, the services, and the first master admin, and it makes the church's users records by the server (H-8: a church's sign-in can't write its own).
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
