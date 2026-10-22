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
