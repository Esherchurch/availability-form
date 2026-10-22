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
