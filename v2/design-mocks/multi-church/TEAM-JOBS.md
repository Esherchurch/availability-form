# Team jobs, not team names — plan (multi-church; FINDINGS-churchhq H-9)

23 Oct 2026. **For review; nothing is built.** Martin: "Other churches will name them differently. Elders might be stewards or deacons, maintenance might be building managers, church office might be admin. They need to be set at the start of setting up a church."

## The idea

The code, the rules and the functions name a **job**, never a team. Each church says which of its teams does each job, and what that team is called. Every word a person sees comes from the church's own team names.

EGBC's mapping is today's names, so **nothing changes for EGBC**.

## The jobs (proposed; question 1)

| Job (what the code says) | What it's for today | EGBC's team today | Suggestions for a new church |
|---|---|---|---|
| `office` | the church office: sends, people, bookings, settings | Church office | Church office, Admin, Administration, Parish office |
| `trustees` | sees the risk registers, members' meetings, compliance | Elders | Elders, Deacons, Stewards, PCC, Trustees, Leadership team |
| `buildings` | maintenance jobs, the building's checks | Maintenance | Maintenance, Buildings, Building managers, Fabric team, Site team |
| `pastoral` | care and support's inbox | Pastoral | Pastoral, Pastoral care, Care team |
| `finance` | payments and Give (today's `moneyTeam` setting) | Finance | Finance, Treasury, Treasurers |
| `children` | the children's register, check-in, the session planner | Kids Church | Kids Church, Sunday School, Children's church |
| `youth` | the youth app, the youth rota | Youth Worship | Youth, Youth group, Youth worship |
| `worship` | the Sunday rota, the service plan | Worship Team | Worship, Music, Music team, Band |
| `av` | sound, words and cameras; ChurchShow | AV Team | AV, Tech, Media, Sound and vision |
| `choir` | a part of worship with its own rota slots | Choir | Choir, Singers |
| `leadership` | runs Sundays across teams (today's Core Team cover) | Core Team | Core Team, Staff team, Ministry team |
| `catering` | the caterers' list | Catering | Catering, Kitchen team, Hospitality |
| `welcome` | welcome and newcomers | Welcome | Welcome, Hospitality, Stewards |
| `prayer` | the prayer team (today's `prayerTeam` setting) | Prayer | Prayer, Prayer ministry |

- **Not jobs:** children's and youth **groups** (Lazers, ReNu). They're the church's own groups, already marked `under18` on Teams and groups. The code that names them by hand (the youth app's band and group lists) reads "every under-18 group" instead.
- **Already settings,** to be folded in: `paymentSettings/public.moneyTeam` (finance), `safeguardingSettings/defaults.trusteeTeam` (trustees), the prayer team, and `runs` on each team (which "running things" tabs its members see; it stays as it is).

## How it's kept

- **`churchSettings/teamJobs`** = `{ <job>: '<team id>' | null }`. A team's display name is its label on Teams and groups.
- **EGBC needs no document:** with none stored, each job takes EGBC's team as its default, so nothing is written for EGBC and nothing changes.
- **Pages:** `EGBCAuth.teamFor(job)`, `EGBCAuth.onJob(job)` (as `inTeam` today, Core Team cover included), `EGBCAuth.jobLabel(job)`.
- **Functions:** `functions/team-jobs.js` gives the same answers from the church's own data (`churchOf`).
- **Rules:** `jobTeam(job)` reads the mapping once, with EGBC's default.
  - **The expression limit matters here** (H-8; the events window's F-279 made room). Every rule that changes from `onTeam('Church office')` to `onJob('office')` is measured with h8-headroom.test.mjs before it goes in.
- **The menu, the app and the emails** take every team word from `jobLabel`.

## New-church setup: "Your teams"

- **A step in setting up a new church.** For each job, a row: "Who does this?", with a suggestion box (the table above) or "Nobody does this". A team is made for each name given.
- **Changeable later** in Church settings > Teams and groups, which gains a "Job" column (master admins only).
- **EGBC:** shown with today's names, already filled in.

## Hidden caps (each becomes a setting, or no limit)

**In the rules** (a list kept on one document):

| Where | Cap | Proposal |
|---|---|---|
| eventLeaders (an event's named leaders) | 20 | no fixed cap: up to 500, the most one document safely holds |
| kidsMornings leaderIds (fire wardens and leaders on a morning) | 60 | 500 |
| screenPages ids (sites on an office screen page) | 3 | a setting, default 3 (it's a layout choice), up to 20 |
| sermonShow/access memberIds | 50 | 500 |
| welcomeSettings memberIds | 30 | 500 |
| planGroups leaderIds | 30 | 500 |
| planSessions onIds / awayIds | 40 each | 500 |
| invoices chargeIds | 200 | 500 |

**In the code** (Firestore takes at most 30 values per `in` / `array-contains-any` query). These files split a longer list into batches of 30, or are made to:
- functions: compiler-send, gocardless, lesson, meetings, notify, planner, prayer-sunday;
- pages and scripts: egbc-app-kids, egbc-auth, egbc-comms, egbc-events-checkin, egbc-events, hub-app, attendance, care-inbox, checkin, events-admin, groups, inventory-system-2, preaching-plan, present, session-planner.

Each is checked with a made-up church of 200 people, 40 teams and 6 sites.

**Lists cut short on purpose** (newest N) stay, but every one says "Showing the latest N" and offers more. These are `.limit(n)` in enews (30, 1000), church-meeting (30), events-admin (50), hub-app (60, 150), meeting (150), session-planner (60) and app (12).

**The events window found** 20 leaders per event, 60 fire wardens, 3 office sites, 30 team members and 30 audiences. The first four are in the tables above. The 30 audiences is the `in` limit, handled by batching.

## Who fixes what (95 files name a team)

Owners are assigned by area, and each window confirms its own. Totals: main 61, events 23, Comms 9, plus the two rules files, where each window changes its own sections.

**Order:**
1. main builds the mapping (pages, functions, rules helpers, setup step, Church settings) and switches its own 61 files.
2. The events window and Comms switch theirs, using the mapping; they don't build their own.
3. A check fails on any team name typed into code outside the defaults table.

| Owner (by area; each window confirms) | File | Team names it uses (times) |
|---|---|---|
| Comms | egbc-comms.js | Church office 1 |
| Comms | egbc-enews-ab.js | Church office 1 |
| Comms | EmailBuilder2.html | Church office 2 |
| Comms | functions/canva.js | Church office 1 |
| Comms | functions/enews-preview.js | Church office 1 |
| Comms | functions/enews-send.js | Church office 1 |
| Comms | functions/enews.js | Church office 1 |
| Comms | functions/social.js | Church office 1 |
| Comms | functions/unsplash.js | Church office 1 |
| events | catering.html | Catering 1 |
| events | compliance.html | Church office 1, Elders 1 |
| events | egbc-app-maint.js | Maintenance 4 |
| events | egbc-board-phone.js | Prayer 1 |
| events | egbc-events-groups.js | Prayer 1 |
| events | egbc-events-roomday.js | Catering 2 |
| events | egbc-events.js | Prayer 1 |
| events | egbc-rota-reports.js | Kids Church 3, Worship Team 6, AV Team 3, Choir 1 |
| events | functions/compliance.js | Church office 1, Elders 1 |
| events | functions/payments.js | Finance 2 |
| events | functions/public-mail-pages.cjs | Prayer 2 |
| events | functions/sg-warnings.js | Elders 1 |
| events | functions/team-mail.js | Church office 1, Maintenance 1, Pastoral 1, Kids Church 1, Youth Worship 1, Worship Team 1 |
| events | giving-details.html | Church office 1 |
| events | kids-admin.html | Kids Church 1, Youth Worship 1, Lazers 1, ReNu 1 |
| events | maintenance.html | Maintenance 2 |
| events | payments.html | Finance 4 |
| events | places-admin.html | Prayer 2 |
| events | risk.html | Church office 1, Elders 1 |
| events | safeguarding-risk.html | Elders 1 |
| events | safeguarding-settings.html | Elders 2 |
| events | session-planner.html | Welcome 1, Prayer 1 |
| events | team-mail.html | Church office 1, Maintenance 1, Pastoral 1, Kids Church 1, Youth Worship 1, Worship Team 1 |
| main | addressbook.html | Church office 4, Kids Church 1, Youth Worship 1, Worship Team 1, AV Team 1, Choir 1, Lazers 1, ReNu 1 |
| main | app.html | Church office 2, Maintenance 2, Kids Church 2, Youth Worship 1, Lazers 2, ReNu 2, Welcome 1 |
| main | AVteamlandingpage.html | AV Team 1 |
| main | batchupload.html | Worship Team 1 |
| main | birthday.html | Core Team 1 |
| main | care-inbox.html | Pastoral 1 |
| main | church-meeting.html | Church office 1, Elders 1 |
| main | church-settings.html | Church office 2 |
| main | CoreTeamApp.html | Youth Worship 1, Worship Team 2, AV Team 1, Core Team 4, Choir 1, Prayer 2 |
| main | Coreteamcharter.html | Core Team 1 |
| main | data-tools.html | Core Team 1 |
| main | egbc-app.js | Church office 1, Maintenance 2, Kids Church 2, Youth Worship 1, Worship Team 1, AV Team 1, Core Team 2, Choir 1, Lazers 2, ReNu 2 |
| main | egbc-auth.js | Elders 5, Maintenance 3, Pastoral 2, Kids Church 5, Youth Worship 3, Worship Team 7, AV Team 6, Core Team 8, Choir 5, Lazers 3, ReNu 3, Finance 4 |
| main | egbc-core-meetings.js | Youth Worship 1 |
| main | egbc-core-planner.js | Kids Church 1 |
| main | egbc-core-rota.js | Youth Worship 8, Worship Team 9, AV Team 7, Core Team 2, Choir 2 |
| main | EGBC-HowTo-AV.html | AV Team 2 |
| main | egbc-kbadmin.js | AV Team 1 |
| main | egbc-menu.js | Church office 10, Elders 3, Maintenance 2, Kids Church 6, Youth Worship 4, Worship Team 7, AV Team 4, Core Team 4, Choir 1, Lazers 1, ReNu 1, Catering 1, Finance 2, Prayer 1 |
| main | EGBC-PlayThrough.html | Worship Team 2 |
| main | egbc-rota-pdf.js | Kids Church 3, Choir 3 |
| main | egbc-shell.js | Core Team 1 |
| main | egbc-starters.js | Welcome 4 |
| main | EGBC-Training-Worship.html | Worship Team 2 |
| main | EGBC-Troubleshoot-AV.html | AV Team 2 |
| main | egbc-ui.js | Core Team 1 |
| main | EGBCWorship&AV.html | Youth Worship 1, Worship Team 1, AV Team 1, Core Team 1, Welcome 3 |
| main | functions/availability-form.js | Youth Worship 1 |
| main | functions/churchshow.js | Worship Team 1, AV Team 1 |
| main | functions/compiler-send.js | Church office 2 |
| main | functions/family.js | Youth Worship 1, Lazers 1, ReNu 1 |
| main | functions/hub-send.js | Church office 2, Kids Church 2, Youth Worship 3, Worship Team 2, AV Team 2, Core Team 3, Lazers 1, ReNu 1 |
| main | functions/meetings.js | Church office 1, Elders 1 |
| main | functions/notify.js | Maintenance 1 |
| main | functions/rota-feed.js | Kids Church 3, Youth Worship 4, Worship Team 6, AV Team 4, Core Team 1, Choir 2 |
| main | functions/video.js | Church office 3, Elders 2, Kids Church 1, Worship Team 1, AV Team 1, Core Team 2, Prayer 2 |
| main | functions/youth-hub.js | Youth Worship 1, Worship Team 1, AV Team 1, Choir 1, Lazers 1, ReNu 1 |
| main | functions/youth-redeem.js | Youth Worship 1, Lazers 1, ReNu 1 |
| main | hub-app.js | Church office 2, Kids Church 6, Youth Worship 8, Worship Team 17, AV Team 9, Core Team 19, Choir 1, Lazers 2, ReNu 2, Welcome 1 |
| main | inventory-system-2.html | AV Team 1 |
| main | Library.html | Worship Team 1 |
| main | meeting.html | Youth Worship 2, Worship Team 3, AV Team 3, Core Team 2, Choir 1 |
| main | MonitorStageMap.html | AV Team 1 |
| main | music-uploader.html | Worship Team 1 |
| main | Performancenotes.html | Worship Team 1 |
| main | Planner.html | Kids Church 5, Youth Worship 8, Worship Team 5, AV Team 4, Core Team 1, Choir 2 |
| main | prayer.html | Prayer 1 |
| main | preaching-plan.html | Worship Team 1, Core Team 1 |
| main | schematic.html | AV Team 1 |
| main | stickynotes.html | Kids Church 1, Youth Worship 1, Worship Team 1, AV Team 1, Core Team 1, Choir 1, Lazers 1, ReNu 1, Prayer 1 |
| main | studio.html | Worship Team 1 |
| main | sundayplannersonglibrary.html | Worship Team 1 |
| main | SundayServicePlanner.html | Kids Church 1, Worship Team 1, Core Team 1 |
| main | teams-admin.html | Church office 1 |
| main | training Sunday planner.html | Core Team 1 |
| main | trainingrotaplanner.html | Youth Worship 6, Worship Team 4, AV Team 3, Core Team 1, Choir 2 |
| main | view-only-rota.html | Worship Team 1, Choir 3 |
| main | worshiphubapp.html | Youth Worship 1, Worship Team 1, Prayer 1 |
| main | Worshipteamcharter.html | Worship Team 1 |
| main | youthapp2.html | Youth Worship 1, Core Team 1, Prayer 1 |
| main | youthserviceplanner.html | Youth Worship 1, Core Team 1 |
| shared: each window its own sections | firestore.rules | Church office 10, Elders 7, Maintenance 1, Pastoral 1, Kids Church 5, Youth Worship 8, Worship Team 12, AV Team 7, Core Team 5, Choir 2, Lazers 2, ReNu 2, Catering 2, Finance 3 |
| shared: each window its own sections | storage.rules | Church office 2, Elders 2, Maintenance 1, Core Team 1 |
