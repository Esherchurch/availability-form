# Handover to a fresh main window (12 October 2026)

You are taking over as the **main window** of EGBC Hub v2. This file is your starting point. **Read it all, then read the files it names, then report back before you change anything** (see "Your first message back" at the end).

Written by the reviewing window, at Martin's request. **The last big handover removed features and wandered off on a tangent, and Martin had to put things back.** This one is built to stop that happening again. So:

- **You are continuing work, not redesigning it.** Every page, feature, button, rule and check that exists today stays, unless Martin explicitly says to remove it.
- **If something looks unused, odd, duplicated or wrong, ask. Don't tidy it.** A lot of what looks strange here was asked for by Martin, or exists so the original site keeps working.
- **Do only what the queue below says, in its order.** Nothing extra and no "while I'm here".

---

## 1. Who's who

- **Martin** owns the project. He's dyslexic, writes no code, and wants plain words, short reports and copy-paste blocks. He tests on his phone and the live site, and he notices things. When he says something has changed, **believe him and check properly before answering.**
- **The reviewing window** (another Claude window) checks every report against GitHub and the live site, makes small fixes, and writes your instructions. Martin pastes its messages to you. Your reports go to Martin, who passes them on.
- **The events window** builds events, room bookings, Kids Church check-in, safeguarding on events, notifications (phone side), sermons (Listen) and the hire pages. **Don't edit its files.** Raise a numbered request in `FINDINGS-events.md` instead.
- **The ChurchShow window** looks after the projection software in a separate private repository. It talks to the hub only through the rules and the pairing functions.
- **Calla** (another window, on another PC) owns the email service `sendEmail`. It isn't in this repository.

## 2. The project in one paragraph

EGBC Hub v2 lives in `v2/` of `Esherchurch/availability-form`. It's live at https://esherchurch.github.io/availability-form/v2/, with Firebase project `egbc-worship-planner` (Firestore, Auth, Storage, Functions in europe-west2, codebase "hub"). It replaces the **original site** (the repository root, outside `v2/`), which the church **still uses every day until switch-over**, against the **same database**. It's becoming the product **Church HQ** (churchhq.co.uk), so build every new feature for **any church**: EGBC's habits become church settings with EGBC's values as the defaults.

## 3. Rules that never bend

1. **No lost functionality.** v2 must do everything the original does. Verify side by side, not from the source code. Structure on existing pages is never a restyle choice (NEXT-BRIEF §15).
2. **Nothing outside `v2/`.** The only exceptions are changes Martin approves one at a time. The reviewing window made some to the original's SundayServicePlanner.html and CoreTeamApp.html on 12 Oct with his approval. Don't touch the root yourself.
3. **Never deploy Firestore or Storage rules.** They go live only on switch-over day, after functions. The original site connects without signing in, and ChurchShow reads by REST, so deploying early stops the church saving. Don't end reports with deploy commands for rules.
4. **Functions:** always `firebase deploy --only functions:hub`. A bare `--only functions` would delete `sendEmail`. Martin deploys.
5. **No app is retired.** Never change a manifest's `id`, `start_url` or `scope`. App names change only with Martin's approval.
6. **Synthetic data only in tests.** Prove a page talks to the emulator before any test writes (NEXT-BRIEF §0). Never read or copy real records into tests.
7. **No under-18 emails, ever.** Young people get parent-emailed codes (YOUTH-ACCESS.md).
8. **Never track adults' attendance.** Kids Church families only, with existing check-ins (NEXT-BRIEF §24).
9. **Don't double up.** If a page already does the job, the app opens it in app mode (APP-DESIGN-BRIEF §5, §7d).
10. **Don't edit the events window's files.** Request through FINDINGS-events.md.
11. Every page follows `DESIGN.md` and works at 375px.
12. **Every new feature gets a feature name** (e.g. `events`, `pinboards`), and its Menu entries, app tabs and Home cards are drawn only when that feature is on. One switch per church comes later (NEXT-BRIEF §24 after launch, item 14); until it exists, everything counts as on. Martin, 13 Oct: a church may use only some parts (e.g. only Worship, AV and Kids Church while staying on ChurchSuite).

## 4. Read these, in this order

1. `NEXT-BRIEF.md`: §0, §4 (standing rules), §12, §15, §21 (access levels), §22–§26. **§26 is the switch-over checklist**, so keep adding to it.
2. `APP-DESIGN-BRIEF.md`, all of it, especially §5 and §7b–§7f. `design/app-mockup.html` is the approved design.
3. `APP-PARITY.md`: the old phone apps, screen by screen.
4. `FINDINGS-app.md`: the A-numbers (open ones listed below).
5. `SERVER-DEPLOY.md`: functions and the switch-over steps. The runtime account is `199442060489-compute@developer.gserviceaccount.com`.
6. `FINDINGS-notify.md`: N-4 and N-5 are requests to you.
7. `DESIGN.md`, `ACCESS-LEVELS.md`, `YOUTH-ACCESS.md`, `NAV-AUDIT.md` when your work touches them.

## 5. Martin's decisions you must keep (the important ones)

- **Access:** Pending / Attender / Church member / Team member (§21). A person sees **only their own teams** as spaces in the app, with no exception for master admin. Master admin uses "View as" on Me.
- **Core Team covers Worship, AV and Choir** everywhere (`CORE_COVERS`). **Worship, AV and Choir are one team for seeing things** (`WORSHIP_AV`, `worshipAv()` in the rules). Rank gates (leader/admin) are separate and unchanged.
- **Running things** comes from **groups** (teams-as-data with `runs`), never from Core Team or "Admin for". **Church office = Val (church administrator) and Ryan (pastor)** (§25, §26).
- **Anyone on Core Team** can use the Email Compiler (not leaders only).
- **Pin boards are for everyone on the team, never leaders only.** That covers Worship, Kids Church, Youth (moderated suggestions from young people), ReNu and Lazers (moderated), and Core Team. On a phone they're small post-its that open full screen, with comments (§7f; Martin approved the look on 12 Oct).
- **Notices:** visible on the hub's home page (the Notices widget), **not hidden**. In the app they sit behind the **bell with a red dot**.
- **The app (approved by eye on 11 Oct):** built FROM the mock-up's code (§7e). Pages open in app mode (§7d). "Worried?" is on every screen, including app mode. The Core Team space has Plan, Rota, Meetings and Team, with the CoreTeamApp code **shared, not copied**: `egbc-core-planner.js`, `egbc-core-meetings.js`, `egbc-core-rota.js`.
- **Performance Notes** stays its own installed app, with a row that opens it.
- **"I'm worried about someone":** a pastoral concern goes to the pastoral team. A safeguarding concern goes **only to the lead and deputy, not master admin**. Nothing automatic.
- **Give:** the bank details live in the signed-in-only `churchSettings/giving`. **Never in the repository.** Martin or Val types them in.
- **Sunday plan:** sending also saves it, and an emailed-only plan still shows its songs. A Sunday with no plan starts blank, never showing last Sunday's songs (tested in `check-emailed-plan.mjs`).
- **Notifications are a launch item**, on Android and iPhone from day one (§23). Never defer them.
- **Launch is held until the app is finished** (Martin chose option b).
- **The home page at 1440 wide may scroll a little.** Leave it.

## 6. Where things stand (12 Oct 2026, evening)

**Update, 12 Oct late: a9843252 pushed and live** — item 1 (Worship/AV/Choir one team in the rules, 1077/1077) and the stuck-splash fix (A-063: after 8s, "Could not check your access… Try again", page stays hidden; check-guard-does-not-spin 7/7). **RESOLVED (13 Oct): the new main window found the clone clean with nothing unpushed; everything below is in origin/main.** The previous main window then started item 2. **Check what it left:** possibly unpushed from the previous main window. Check `git status` and `git log origin/main..HEAD` in **this** working copy first:
- **Item 1:** Worship/AV/Choir as one team in `firestore.rules` (`worshipAv()`), plus `tests/check-worship-av-one-team.mjs` 12/12, and the guard-readiness fix in five checks ("is the page revealed" = `#egbc-guard-style` gone, not "no splash").
- If any of that is committed but unpushed, run the checks it names, then push. If it's uncommitted and incomplete, **report what you find. Don't redo or discard it.**

**Recently done and accepted (don't redo):** pin board on a phone (§7f) including comment margins; Give parts 1 and 2; email lock step 1 (live, Calla's); notices widget at 375px; the bell; "Worried?" in app mode; the calendar sheet with Apple/Google/Outlook; teams-as-data and Running things; the Core Team space; app mode for 23 pages; the installable app (`manifest-app.json`); the harness turning a page throw red; the style check green.

## 7. The queue, in this order

1. ~~Item 1~~ DONE (a9843252).
2. ~~The stuck "Checking access" splash (A-063)~~ DONE (a9843252). When the guard's first profile read doesn't come back, a page can sit on "Checking access" forever. Martin hit it on his phone on 12 Oct, and a check saw it on schematic.html. Find why the read can hang. Make the guard retry, then show "Couldn't check your access — try again" after about 8 seconds instead of spinning. Test it with a deliberate stall.
3. ~~The Sunday plan for everyone on the email~~ DONE (ab09a833). **Still owed: the audience backfill script** (NEXT-BRIEF §26 item 13), because the old site's planners don't write an audience. Was: That includes preachers, service leaders and AV. Today the email's link (song-summary.html) is Worship-only. Spec: the reviewing window's message (the read-only plan view for exactly that date's email audience; an `audience` list of uids written by both planners' Send; rules allowing `request.auth.uid in audience` or the worship/AV/core teams; Home shows "You're preaching on Sunday — see the plan"). Tests: a speaker on no team sees their Sunday and not another; an AV member sees it; an attender not on the email can't.
4. **N-4 and N-5 (notifications)** from `FINDINGS-notify.md`: the sending functions in codebase "hub" (call a parent, test message, rota reminder, booking updates, new maintenance job (also covers F-129's email), urgent notice, weekly checks reminder), the service worker line, registering it, Notifications under Me and in the Menu, and letting parents who aren't in the address book in narrowly (Parents' Sunday and Notifications only, nothing else). The hub's server calls to `sendEmail` must send a Google identity token for audience `https://sendemail-irkwdhx3xq-uc.a.run.app` (§26 item 4).
5. **Stage 2, the family link-up (`myFamily()`):** "Your family this week" on Home; a young person's main-rota dates and both charters; a parent seeing the family's youth groups; F-145 (Parents' Sunday drawn on Home, collection code large). Side-by-side pairs against the mock-up for Martin.
6. **The rest of §7d B:** the native "find a person" screen (closes A-073). Anything in APP-PARITY still without a home.
7. **§7c part 2:** behind a switch that stays OFF until switch-over, the installed EGBC Hub (and the old Core Team, Worship Hub and Youth Hub apps) opens the new app on a phone. `hub.html?web=1` skips it, and "Open the full website" stays on Me.
8. **Sermons:** the Sermons role/tick (the events window then switches its rules to it), the now-playing bar, and the hourly feed function (F-139). Val's feed address is still awaited from Martin.
9. **Email lock, before switch-over:** `egbc-email.js` and every v2 sender attach the signed-in person's ID token, and the hub functions send identity tokens. Coordinate the date with the reviewing window. Calla removes the open path on switch-over day.
10. **Step Q:** the launch checklist page, from §26 plus `SWITCHOVER-events.md`.

**ADDED TO THE LAUNCH QUEUE (Martin, 13 Oct), after item 11 (Step Q) in this order unless Martin reorders:** Watch (YouTube channel and live link with show-until), Gift Aid declarations (Val can tick existing ones), CCLI report for admins, privacy tools, read and confirm for policies, church meetings and votes in the meeting page, prayer requests and answers (with Speak), I'm new here, the public What's on (public / members only / not listed), recording play-throughs (audio only). Specs: NEXT-BRIEF §24 items 5–13 and 15. Each gets a feature name (rule 12).

**After launch (don't start):** item 14 ("what does your church use?") and the parked captions idea. Formerly: NEXT-BRIEF §24's after-launch list, including item 5, "Watch" (the YouTube channel `UCf7lMnb24HfNJKGpMeYdQXQ`, members-only full services, the weekly live link with show-until and the church's choice of disappear or Watch again).

## 8. Open findings to know about

- **The test suite:** `node tests/run-all.mjs` (from `v2/`) runs every check (35/42 on 12 Oct). Known reds: check-core-planner 68/72 (red before a9843252 too), check-churchshow-page (flaky; 15/15 earlier the same day), check-website-on-a-phone (A-074), plus F-158 (events window). **Several checks only pass alone**, because they share one emulator and read each other's leftovers. The fix is for each check to own and clear its own fixture. It's a separate piece of work, not started; raise it before doing it.

- ~~**A-063:** the guard never recovers from a failed first read~~ FIXED (a9843252): the 8s message and Try again, page stays hidden.
- **A-064:** the Attender's mirror write doesn't arrive. Open, not established.
- **A-073:** the address book in app mode has controls under the tab bar (fixed by "find a person").
- **A-074:** Library.html's "view as" strip is 73px. Martin said leave it.
- `check-website-on-a-phone` is 3/4 because of A-074. That's known and accepted.

## 9. How to work (what has kept the work trustworthy)

- **Pull before you touch shared files** (`egbc-auth.js`, `egbc-shell.js`, `hub.html`, `hub-app.js`, `app.html`, `firestore.rules`). Others push to `main` too. Rebase; never force-push.
- **Emulators:** in your folder, `firebase emulators:start` (auth 9099, firestore 8181, storage 9199, functions 5101, UI 4000). The events window uses 8182/9098/9198 and 4402/4502/4002. Don't share scratch files: put output in your own session folder.
- **Every change gets a check that can fail, and a deliberate break that proves it fails.** Say when a break caught nothing.
- **Don't trust a count or a grep that could match a comment.** It has fooled this project six times.
- **Run the targeted checks as you go and the full suite once per push**, not after every step. That's for speed.
- **Reports, in plain words, short:** what changed, the live commit, the checks and breaks, what isn't done, and the one proof that matters. **End every report with "Stopping here" or "Carrying on with …"** so Martin knows whether you're waiting.
- **Commits** end with the Co-Authored-By line the system gives you.

## Your first message back (before any change)

Reply with:
1. what `git status` / unpushed commits you found, and what you'll do about them
2. the queue above in your own words, one line each, so the reviewing window can check you've understood it
3. anything in this file that contradicts what you find in the repository
4. "Stopping here", and wait.
