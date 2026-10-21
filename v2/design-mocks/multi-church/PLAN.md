# Church HQ for more than one church: design note (plan only, for review)

*Main window, 21 Oct 2026. For the reviewing window and Martin. Nothing is built from this until it is agreed.*

Martin, 21 Oct: Church HQ must support **more than one church from now on, built in, not later.** This compares three ways:

- **A.** One Firebase project per church.
- **B.** One shared project, every record and rule keyed by church.
- **C.** Groups of churches, each group a project with B inside it.

It recommends one. The reviewing window leans to B, designed so C is possible later; Martin leans to A for safeguarding data.

**Numbers marked "estimate" are ours, not Google's.** The deploy time is to be measured on the next full deploy.

---

## The facts this rests on

**This project today:**
- **124 Cloud Functions:** 67 callable, 27 database triggers, 15 scheduled, 15 HTTP.
- **One Firestore database, one Storage bucket, one Auth user pool.**
- **Pages:** on GitHub Pages.

**Shared Church HQ services, already one for all churches:**
- **Resend:** `HQ_RESEND_API_KEY`, sending from `mail.churchhq.co.uk`.
- **Daily:** Church HQ's account; rooms are named `<churchId>-<room>`.
- **The slide converter.**
- **Unsplash.**
- **The Microsoft 365 app**, multi-tenant.

**Google's limits that matter:**
- **Projects per billing account.** The number linked to one billing account is small for a new account and is raised only on request, case by case. Google publishes no number.
- **Quotas are per project.** Deploy quotas (Cloud Build, Cloud Functions/Run admin API calls) are per project. So are Firestore's free daily allowance (50,000 reads, 20,000 writes, 1 GiB) and Cloud Functions' free tier.
- **Cloud Scheduler.** It charges $0.10 per job per month after the first 3 free per billing account. Every scheduled function is one job.
- **Firebase Hosting:** up to 36 sites per project, each with its own custom domains (each verified by DNS). Hosting does **not** take a wildcard domain, so `*.churchhq.co.uk` needs one domain added per church, or a proxy in front (below).

**Deploy time today:** one full deploy of the hub codebase is about **15 minutes** (estimate; to be measured).

---

## The three, side by side

| | **A. Project per church** | **B. One shared project** | **C. Groups of churches** |
|---|---|---|---|
| **Data isolation** | Complete: separate database, bucket, users, IAM. A rules mistake can't reach another church. | By rules and paths. **Every** rule and query must be right, and proved by tests that try to cross. | As B inside a group. Groups are fully apart from each other. |
| **Safeguarding data** | Strongest by construction. | Under `churches/{id}/safeguarding/…`. The rules allow only that church's lead and deputy, plus automated cross-church tests. | As B. A church that needs it can have **a group of one** (A for that church only). |
| **GDPR: deleting a church** | Delete the project: everything, Auth included, after Google's 30-day hold. Plus their rows in shared services (Resend logs, Daily rooms). | A tested "delete church" job: recursive delete of `churches/{id}`, its Storage prefix, Auth accounts that belong to no other church, and the shared-service rows. Backups age out on their schedule. | As B, or delete the project for a group of one. |
| **Rules** | Today's rules, unchanged per project. | Every path under `churches/{cid}`. Every rule adds "a member of this church" (`cid in request.auth.token.churches`). | As B. |
| **Cost** | Each church gets Firebase's free daily allowance, so small churches are almost free. **But** 15 Scheduler jobs per church, and admin overhead per project. | One free allowance for everyone, then pay per use. 15 Scheduler jobs in total. | Between the two. |
| **Deploys** | 124 functions × N projects. Needs a fleet deployer, and drift is a real risk. | One deploy, about 15 min, at any size. | One deploy per group, run in parallel. |
| **Keeping code in step** | Hard: N deploys must all succeed; a church can be left on old code. | Automatic: one codebase, one deploy. | A few deploys. Easy to watch. |
| **Web address** | Each project's Firebase Hosting with its own domain, `<church>.churchhq.co.uk`. | One Hosting site; the church comes from the address. Either add each `<church>.churchhq.co.uk` (DNS each), or put a small proxy that takes `*.churchhq.co.uk` in front (Cloudflare). | As B, per group. |
| **Phone app** | One app; signing in chooses the church, then loads **that project's** config. The app must carry a directory of churches → projects. | One app, one config. The church comes from sign-in (claims) or the link. | One app; a small directory maps church → group project. |
| **Sign-in** | A separate account per church. Someone in two churches has two sign-ins. | One account. Membership per church in custom claims (`churches: [ids]`). Someone in two churches switches without signing out. | One account per group. Cross-group is two accounts (rare). |
| **ChurchShow pairing** | The pairing code must say which project. A central directory resolves code → project. | The pairing token carries `churchId` with `siteId`. Rules check both. | Code → group (directory) → as B. |
| **Quiz codes** (phones, no account) | A short code alone can't say which project. A central directory is needed. | One code space, so codes are unique across churches (the same run collection with `churchId`). Nothing else changes. | Directory → group, then as B. |
| **EGBC's data** | Stays where it is: egbc-worship-planner **is** EGBC's project. No move. | A one-off move into `churches/egbc/…` for every collection and file (script, dry run, verify). **Or** EGBC stays in its own project as a group of one (C) and new churches start in the shared one. | EGBC's project becomes group 1 (after the B move inside it), or stays a group of one. |

---

## Deploy time and quotas at 10, 100 and 1,000 churches

Assumptions:
- One full deploy is about 15 minutes per project (estimate).
- For A and C, a fleet deployer runs 10 projects at once.
- C groups are 100 churches each.

| | Churches | Projects | Cloud Functions in total | Full deploy, wall clock | Scheduler jobs (cost per month) | Billing-account project quota |
|---|---|---|---|---|---|---|
| **A** | 10 | 10 | 1,240 | ~15 min (10 at once) | 150 (~$15) | needs raising |
| | 100 | 100 | 12,400 | ~2.5 h | 1,500 (~$150) | needs repeated raising |
| | 1,000 | 1,000 | 124,000 | ~25 h, and any failure leaves churches on old code | 15,000 (~$1,500) | unlikely to be granted without a Google sales relationship |
| **B** | 10 | 1 | 124 | ~15 min | 15 (~$1) | none |
| | 100 | 1 | 124 | ~15 min | 15 | none |
| | 1,000 | 1 | 124 | ~15 min | 15 | none (watch Firestore hot spots, below) |
| **C** | 10 | 1 | 124 | ~15 min | 15 | none |
| | 100 | 1 | 124 | ~15 min | 15 | none |
| | 1,000 | 10 | 1,240 | ~15 min (10 at once) | 150 (~$15) | 10 projects: an ordinary request |

**At scale B needs these:**
- **Scheduled jobs work church by church in batches:** 15 jobs that each loop over N churches, kept inside the function's time limit by paging and fanning out to a task queue.
- **Firestore indexes include `churchId`,** or the work lives under each church's path, so one church's busy Sunday can't slow another's queries.

---

## Recommendation: B, built as "churches/{churchId}/…", so C is a later switch, not a rebuild

1. **Every church's data lives under `churches/{churchId}/…`** in Firestore, and under `churches/{churchId}/` in Storage. This is better than a `churchId` field on each record:
   - deleting a church is one recursive delete;
   - every rule starts from the path;
   - a query can't forget the filter, because the path *is* the filter.
2. **Membership is in the sign-in.** Custom claims hold `churches: [ids]`, set by the server from each church's address book. Every rule's first test is that the path's church is in the claims.
3. **Safeguarding gets the strongest wall B can give:**
   - its own sub-path, readable only by that church's lead and deputy;
   - no cross-church query anywhere in the code;
   - automated tests that sign in as church X and try every safeguarding path of church Y.
   - **For a church whose policy needs physical separation:** a group of one (C). The same code, its own project.
4. **A Church HQ directory**, `churchhq/churches/{id}`, is the one place that knows each church: name, domain, group (project), plan and billing status. In B every church's group is "main"; C is adding a second group and pointing a church at it.
5. **Web address:** `<church>.churchhq.co.uk` through Firebase Hosting, plus one small Cloudflare proxy for the wildcard. The hub then reads the church from the address.
6. **Tests that prove no cross-church access.** These are part of the build, not later:
   - a rules suite that, for **every** collection, signs in as a member and an admin of church A and tries to read and write church B — all must be denied;
   - a function suite that calls every callable with church B's ids as church A's user;
   - a check that fails if any new collection is added outside `churches/{cid}` without a stated reason.

**Why not A, despite the safeguarding argument:**
- **Deploys and quotas:** 124 functions per church, 25 hours to update 1,000 churches, and project quotas Google decides case by case.
- **Shared services each need a router:** quiz codes, ChurchShow pairing and the app all need a directory anyway.
- **The safeguarding case is met better** by B's per-church paths and tests for everyone, plus a dedicated project (C) for the few who need it.

**EGBC:** EGBC stays in egbc-worship-planner while the shared project is built and proved with made-up churches. Then either:
- (i) EGBC moves into `churches/egbc/…` in the shared project (a scripted move with a dry run, as for the ChurchSuite import); or
- (ii) EGBC's project becomes a group of one.

That's Martin's choice at that point; the code is the same.

---

## What Martin decides

1. **B (recommended), A or C.**
2. **The domain:** `churchhq.co.uk` and per-church subdomains, with Cloudflare in front, or another arrangement.
3. **For EGBC:** move into the shared project, or keep its own (a group of one).
4. **Whether any church's safeguarding policy requires a separate project.** If so, C is offered from the start.

## Order of work once agreed (each step with checks and breaks)

1. **The directory and claims** (`churches` in the token), with no data moved.
2. **The rules and paths under `churches/{cid}`**, with the cross-church suites, against made-up churches.
3. **Functions take `churchId` from the path or the claims**, never from the page.
4. **Hosting by subdomain;** the app's church picker for someone in two churches.
5. **"Delete a church"** (GDPR), tested end to end on a made-up church.
6. **EGBC:** move, or a group of one.
