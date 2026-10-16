# Audit report

Run 2026-10-16 10:13 UTC, on the emulator. Roles: master, areaAdmin, core, kids, worship, everyone. Sizes: 360, 375, 412, 1440. Taps at 375.

**199 failing, 1537 passing, of 1736 screens.**

Made by `node tests/audit-everything.mjs`. Pictures: tests/shots/audit/<role>/<size>/.

| Screen | Role | Size | Result | Why |
|---|---|---|---|---|
| addressbook.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Address Book Care AA Team directory + Add a person AB Ada Bandleader Synthetic — — P: S: Edit × AV App View Master Synthetic ava.master@example.invalid — P: S: ") |
| addressbook.html (not in their Menu) | everyone | 375 | **FAIL** | console: [2026-10-16T11:45:02.672Z]  @firebase/firestore: Firestore (10.7.1): Uncaught Error in snapshot listener: FirebaseError: [code=permission-denied]: 
evaluation error at L488:22 for 'list' @ L488, false |
| app: core / plan | core | 360 | **FAIL** | small: 1 control is under 30px to tap (Pick another date 113x24) |
| app: core / plan | core | 375 | **FAIL** | small: 1 control is under 30px to tap (Pick another date 113x24) |
| app: core / plan | core | 412 | **FAIL** | small: 1 control is under 30px to tap (Pick another date 113x24) |
| app: core / plan | master | 360 | **FAIL** | small: 1 control is under 30px to tap (Pick another date 113x24) |
| app: core / plan | master | 375 | **FAIL** | small: 1 control is under 30px to tap (Pick another date 113x24) |
| app: core / plan | master | 412 | **FAIL** | small: 1 control is under 30px to tap (Pick another date 113x24) |
| app: core / rota | core | 360 | **FAIL** | small: 523 controls are under 30px to tap (Audit 46x22; Archive 68x28; − 26x26) |
| app: core / rota | core | 375 | **FAIL** | small: 549 controls are under 30px to tap (Audit 46x22; Archive 68x28; − 26x26) |
| app: core / rota | core | 412 | **FAIL** | small: 549 controls are under 30px to tap (Audit 46x22; Archive 68x28; − 26x26) |
| app: core / rota | master | 360 | **FAIL** | small: 497 controls are under 30px to tap (Audit 46x22; Archive 68x28; − 26x26) |
| app: core / rota | master | 375 | **FAIL** | small: 537 controls are under 30px to tap (Audit 46x22; Archive 68x28; − 26x26) |
| app: core / rota | master | 412 | **FAIL** | small: 549 controls are under 30px to tap (Audit 46x22; Archive 68x28; − 26x26) |
| attendance.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Registers Care AA Open this from an event: Events, then Who is coming, then Registers and downloads. Events") |
| attendance.html (not in their Menu) | core | 375 | **FAIL** | access: opens for core, whose Menu does not offer it (it says: "Registers Care AC Open this from an event: Events, then Who is coming, then Registers and downloads. Events") |
| attendance.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Registers Care AE Open this from an event: Events, then Who is coming, then Registers and downloads. Events") |
| attendance.html (not in their Menu) | kids | 375 | **FAIL** | access: opens for kids, whose Menu does not offer it (it says: "Registers Care AK Open this from an event: Events, then Who is coming, then Registers and downloads. Events") |
| attendance.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Registers Care AW Open this from an event: Events, then Who is coming, then Registers and downloads. Events") |
| checkin.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Check-in Care AA Check-in Choose the event you are checking people in to. Roll-call: who is in now Today and this week Nothing in the next week.") |
| checkin.html (not in their Menu) | core | 375 | **FAIL** | access: opens for core, whose Menu does not offer it (it says: "Check-in Care AC Check-in Choose the event you are checking people in to. These are the events you lead. Today and this week Nothing in the next week.") |
| checkin.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Check-in Care AE Check-in Choose the event you are checking people in to. These are the events you lead. Today and this week Nothing in the next week.") |
| checkin.html (not in their Menu) | kids | 375 | **FAIL** | access: opens for kids, whose Menu does not offer it (it says: "Check-in Care AK Check-in Choose the event you are checking people in to. These are the events you lead. Today and this week Nothing in the next week.") |
| checkin.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Check-in Care AW Check-in Choose the event you are checking people in to. These are the events you lead. Today and this week Nothing in the next week.") |
| church-settings.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Church details Care AA Church details The name, enquiry email and logo shown on the public room-hire pages and in emails. Change them here, once. Church name En") |
| Coreteamcharter.html (not in their Menu) | everyone | 375 | **FAIL** | console: Charter load failed FirebaseError: 
evaluation error at L1416:22 for 'get' @ L1416, false for 'get' @ L4264, false for 'get' @ L1416, false for 'get' @ L4264 |
| data-tools.html | master | 360 | **FAIL** | small: 1 control is under 30px to tap (Clear 26x15) |
| data-tools.html | master | 375 | **FAIL** | small: 1 control is under 30px to tap (Clear 26x15) |
| data-tools.html | master | 412 | **FAIL** | small: 1 control is under 30px to tap (Clear 26x15) |
| EGBC-HowTo-AV.html | master | 375 | **FAIL** | dead: "Search" does nothing; dead: "Clear" does nothing; dead: "Camera setup" does nothing; dead: "EQ settings" does nothing; dead: "Upload and publish" does nothing; dead: "Replace video file" does nothing; dead: "a control" does nothing; dead: "Categories" does nothing; dead: "Manage" does nothing |
| EGBC-PlayThrough.html | areaAdmin | 360 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 312x24) |
| EGBC-PlayThrough.html | areaAdmin | 375 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 327x24) |
| EGBC-PlayThrough.html | areaAdmin | 412 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 364x24) |
| EGBC-PlayThrough.html | core | 360 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 312x24) |
| EGBC-PlayThrough.html | core | 375 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 327x24) |
| EGBC-PlayThrough.html | core | 412 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 364x24) |
| EGBC-PlayThrough.html | master | 360 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 312x24) |
| EGBC-PlayThrough.html | master | 375 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 327x24); dead: "Search" does nothing; dead: "Clear" does nothing; dead: "Way Maker" does nothing; dead: "Keyboard intro" does nothing; dead: "Guitar chorus" does nothing; dead: "Intros" does nothing; dead: "Chorus" does nothing; dead: "Full Songs" does nothing; dead: "A" does nothing; dead: "B♭" does nothing; dead: "B" does nothing; dead: "C" does nothing; dead: "D" does nothing; dead: "E" does nothing; dead: "F" does nothing; dead: "G" does nothing; dead: "Upload and publish" does nothing; dead: "Replace video file" does nothing; dead: "a control" does nothing; dead: "Categories" does nothing; dead: "Manage" does nothing; dead: "All Songs 1 item" does nothing; sheet: "Published playthrough" opens a sheet (modal) with no visible close after scrolling it |
| EGBC-PlayThrough.html | master | 412 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 364x24) |
| EGBC-PlayThrough.html | worship | 360 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 312x24) |
| EGBC-PlayThrough.html | worship | 375 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 327x24) |
| EGBC-PlayThrough.html | worship | 412 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 364x24) |
| EGBC-Training-Worship.html | areaAdmin | 360 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 312x24) |
| EGBC-Training-Worship.html | areaAdmin | 375 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 327x24) |
| EGBC-Training-Worship.html | areaAdmin | 412 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 364x24) |
| EGBC-Training-Worship.html | core | 360 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 312x24) |
| EGBC-Training-Worship.html | core | 375 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 327x24) |
| EGBC-Training-Worship.html | core | 412 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 364x24) |
| EGBC-Training-Worship.html | master | 360 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 312x24) |
| EGBC-Training-Worship.html | master | 375 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 327x24); dead: "Search" does nothing; dead: "Clear" does nothing; dead: "Keys playing" does nothing; dead: "Stage presence" does nothing; dead: "Upload and publish" does nothing; dead: "Replace video file" does nothing; dead: "a control" does nothing; dead: "Categories" does nothing; dead: "Manage" does nothing; dead: "All Content 1 item" does nothing; sheet: "Video Published training" opens a sheet (modal) with no visible close after scrolling it |
| EGBC-Training-Worship.html | master | 412 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 364x24) |
| EGBC-Training-Worship.html | worship | 360 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 312x24) |
| EGBC-Training-Worship.html | worship | 375 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 327x24) |
| EGBC-Training-Worship.html | worship | 412 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 364x24) |
| EGBC-Troubleshoot-AV.html | master | 375 | **FAIL** | dead: "Search" does nothing; dead: "Clear" does nothing; dead: "Black screen" does nothing; dead: "Mic feedback" does nothing; dead: "Projector" does nothing; dead: "Upload and publish" does nothing; dead: "Replace video file" does nothing; dead: "a control" does nothing; dead: "Categories" does nothing; dead: "Manage" does nothing; dead: "Add by URL instead" does nothing |
| EmailBuilder2.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Email Compiler Care AA Email Builder B I •≡ Size Small Normal Large Huge Font Arial Georgia Trebuchet Verdana Times Courier Spacing Tight Normal Roomy ⤓ Fix spa") |
| events-admin.html | master | 360 | **FAIL** | small: 5 controls are under 30px to tap (Choo e Sunday Morning Wo 22x22; Choo e Sunday Morning Wo 22x22; Choo e Sunday Morning Wo 22x22); hidden: the end of the page is under the bottom bar |
| events-admin.html | master | 375 | **FAIL** | small: 6 controls are under 30px to tap (Choo e Sunday Morning Wo 22x22; Choo e Sunday Morning Wo 22x22; Choo e Sunday Morning Wo 22x22); hidden: the end of the page is under the bottom bar; sheet: "Share on WhatsApp" opens a sheet (egbc-share-back) with no visible close after scrolling it |
| events-admin.html | master | 412 | **FAIL** | small: 6 controls are under 30px to tap (Choo e Sunday Morning Wo 22x22; Choo e Sunday Morning Wo 22x22; Choo e Sunday Morning Wo 22x22); hidden: the end of the page is under the bottom bar |
| events-admin.html | master | 1440 | **FAIL** | hidden: the end of the page is under the bottom bar |
| events-admin.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Events Care AA Events Create events, open sign-ups and see who is coming. New event Show past events What people see Coming up 6 Choose all 6 Sunday Morning Wor") |
| events-admin.html (not in their Menu) | core | 375 | **FAIL** | access: opens for core, whose Menu does not offer it (it says: "Events Care AC Events I run The events you are on the team for: change them, see who is coming, check people in. Show past events What people see You are not on") |
| events-admin.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Events Care AE Events I run The events you are on the team for: change them, see who is coming, check people in. Show past events What people see You are not on") |
| events-admin.html (not in their Menu) | kids | 375 | **FAIL** | access: opens for kids, whose Menu does not offer it (it says: "Events Care AK Events I run The events you are on the team for: change them, see who is coming, check people in. Show past events What people see You are not on") |
| events-admin.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Events Care AW Events I run The events you are on the team for: change them, see who is coming, check people in. Show past events What people see You are not on") |
| findability (taps from Home) | areaAdmin | 375 | **FAIL** | findability: Room bookings is 4 taps from Home |
| findability (taps from Home) | core | 375 | **FAIL** | findability: Rota planner is 4 taps from Home; findability: Sunday service plan is 4 taps from Home |
| findability (taps from Home) | core | 1440 | **FAIL** | findability: Rota planner is 4 taps from Home; findability: Sunday service plan is 4 taps from Home |
| findability (taps from Home) | master | 375 | **FAIL** | findability: Send an email is 4 taps from Home; findability: Rota planner is 4 taps from Home; findability: Sunday service plan is 4 taps from Home; findability: Address book is 4 taps from Home; findability: Team emails is 4 taps from Home; findability: Events is 4 taps from Home; findability: Places is 4 taps from Home; findability: Room bookings is 4 taps from Home; findability: Check-in is 4 taps from Home; findability: Registers is 4 taps from Home; findability: Headcounts is 4 taps from Home; findability: Picture library is 4 taps from Home; findability: Church settings is 4 taps from Home; findability: Teams and groups is 4 taps from Home; findability: Emails sent is 4 taps from Home; findability: Backup is 4 taps from Home |
| findability (taps from Home) | master | 1440 | **FAIL** | findability: Send an email is 4 taps from Home; findability: Rota planner is 4 taps from Home; findability: Sunday service plan is 4 taps from Home; findability: Address book is 4 taps from Home; findability: Teams and groups is 4 taps from Home |
| from the app: EGBC-HowTo-AV.html | master | 375 | **FAIL** | dead: "Search" does nothing; dead: "Clear" does nothing; dead: "Camera setup" does nothing; dead: "EQ settings" does nothing; dead: "Upload and publish" does nothing; dead: "Replace video file" does nothing; dead: "a control" does nothing; dead: "Categories" does nothing; dead: "Manage" does nothing; dead: "People" does nothing; dead: "Bookings" does nothing |
| from the app: EGBC-PlayThrough.html | areaAdmin | 360 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 312x24) |
| from the app: EGBC-PlayThrough.html | areaAdmin | 375 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 327x24) |
| from the app: EGBC-PlayThrough.html | areaAdmin | 412 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 364x24) |
| from the app: EGBC-PlayThrough.html | core | 360 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 312x24) |
| from the app: EGBC-PlayThrough.html | core | 375 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 327x24) |
| from the app: EGBC-PlayThrough.html | core | 412 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 364x24) |
| from the app: EGBC-PlayThrough.html | master | 360 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 312x24) |
| from the app: EGBC-PlayThrough.html | master | 375 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 327x24); dead: "Search" does nothing; dead: "Clear" does nothing; dead: "Way Maker" does nothing; dead: "Keyboard intro" does nothing; dead: "Guitar chorus" does nothing; dead: "Intros" does nothing; dead: "Chorus" does nothing; dead: "Full Songs" does nothing; dead: "A" does nothing; dead: "B♭" does nothing; dead: "B" does nothing; dead: "C" does nothing; dead: "D" does nothing; dead: "E" does nothing; dead: "F" does nothing; dead: "G" does nothing; dead: "Upload and publish" does nothing; dead: "Replace video file" does nothing; dead: "a control" does nothing; dead: "Categories" does nothing; dead: "Manage" does nothing; dead: "All Songs 1 item" does nothing; sheet: "Published playthrough" opens a sheet (modal) with no visible close after scrolling it |
| from the app: EGBC-PlayThrough.html | master | 412 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 364x24) |
| from the app: EGBC-PlayThrough.html | worship | 360 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 312x24) |
| from the app: EGBC-PlayThrough.html | worship | 375 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 327x24) |
| from the app: EGBC-PlayThrough.html | worship | 412 | **FAIL** | small: 1 control is under 30px to tap (All Song 1 item 364x24) |
| from the app: EGBC-Training-Worship.html | areaAdmin | 360 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 312x24) |
| from the app: EGBC-Training-Worship.html | areaAdmin | 375 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 327x24) |
| from the app: EGBC-Training-Worship.html | areaAdmin | 412 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 364x24) |
| from the app: EGBC-Training-Worship.html | core | 360 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 312x24) |
| from the app: EGBC-Training-Worship.html | core | 375 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 327x24) |
| from the app: EGBC-Training-Worship.html | core | 412 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 364x24) |
| from the app: EGBC-Training-Worship.html | master | 360 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 312x24) |
| from the app: EGBC-Training-Worship.html | master | 375 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 327x24); dead: "Search" does nothing; dead: "Clear" does nothing; dead: "Keys playing" does nothing; dead: "Stage presence" does nothing; dead: "Upload and publish" does nothing; dead: "Replace video file" does nothing; dead: "a control" does nothing; dead: "Categories" does nothing; dead: "Manage" does nothing; dead: "All Content 1 item" does nothing; sheet: "Video Published training" opens a sheet (modal) with no visible close after scrolling it |
| from the app: EGBC-Training-Worship.html | master | 412 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 364x24) |
| from the app: EGBC-Training-Worship.html | worship | 360 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 312x24) |
| from the app: EGBC-Training-Worship.html | worship | 375 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 327x24) |
| from the app: EGBC-Training-Worship.html | worship | 412 | **FAIL** | small: 1 control is under 30px to tap (All Content1 item 364x24) |
| from the app: EGBC-Troubleshoot-AV.html | master | 375 | **FAIL** | dead: "Search" does nothing; dead: "Clear" does nothing; dead: "Black screen" does nothing; dead: "Mic feedback" does nothing; dead: "Projector" does nothing; dead: "Upload and publish" does nothing; dead: "Replace video file" does nothing; dead: "a control" does nothing; dead: "Categories" does nothing; dead: "Manage" does nothing; dead: "Add by URL instead" does nothing; dead: "People" does nothing; dead: "Bookings" does nothing |
| from the app: groups.html | areaAdmin | 360 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | areaAdmin | 375 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | areaAdmin | 412 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | core | 360 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | core | 375 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | core | 412 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | everyone | 360 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | everyone | 375 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | everyone | 412 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | kids | 360 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | kids | 375 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | kids | 412 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | master | 360 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | master | 375 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | master | 412 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | worship | 360 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | worship | 375 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: groups.html | worship | 412 | **FAIL** | small: 1 control is under 30px to tap (INPUT 157x20) |
| from the app: safeguarding.html | kids | 375 | **FAIL** | sheet: "Report a concern" opens a sheet (mBack) with no visible close after scrolling it |
| headcounts.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Headcounts Care AA Headcounts A quick count for each Sunday service or event: how many adults, children and people online. Numbers only, no names. Add a count D") |
| hubresources.html | master | 360 | **FAIL** | console: TypeError: Cannot read properties of null (reading 'appendChild'); console: unhandled rejection: Cannot read properties of null (reading 'appendChild') |
| index.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Esher Green Baptist Church Availability Form Worship & AV Member Login Check My Services Choices are saved instantly as you click.") |
| index.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Esher Green Baptist Church Availability Form Worship & AV Member Login Check My Services Choices are saved instantly as you click.") |
| index.html (not in their Menu) | kids | 375 | **FAIL** | access: opens for kids, whose Menu does not offer it (it says: "Esher Green Baptist Church Availability Form Worship & AV Member Login Check My Services Choices are saved instantly as you click.") |
| index.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Esher Green Baptist Church Availability Form Worship & AV Member Login Check My Services Choices are saved instantly as you click.") |
| inventory-system-2.html (not in their Menu) | everyone | 375 | **FAIL** | console: [2026-10-16T11:43:49.506Z]  @firebase/firestore: Firestore (10.12.2): Uncaught Error in snapshot listener: FirebaseError: [code=permission-denied]: 
evaluation error at L1389:22 for 'list' @ L1389, fa |
| kids-admin.html | master | 360 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 290x21; INPUT 290x21; INPUT 290x21) |
| kids-admin.html | master | 375 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 305x21; INPUT 305x21; INPUT 305x21) |
| kids-admin.html | master | 412 | **FAIL** | small: 5 controls are under 30px to tap (INPUT 342x21; INPUT 342x21; INPUT 342x21) |
| kids-admin.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Children's register Care AA Children's register Sunday groups, the children registered for them, and registration: the parent consent form, once a year. Not set") |
| kids-admin.html (not in their Menu) | core | 375 | **FAIL** | access: opens for core, whose Menu does not offer it (it says: "Children's register Care AC Children's register Sunday groups, the children registered for them, and registration: the parent consent form, once a year. Not set") |
| kids-admin.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Children's register Care AE Children's register Sunday groups, the children registered for them, and registration: the parent consent form, once a year. Not set") |
| kids-admin.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Children's register Care AW Children's register Sunday groups, the children registered for them, and registration: the parent consent form, once a year. Not set") |
| kids-checkin.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Sunday check-in Care AA Sunday check-in Children into their groups, labels with a collection code, and home again only with someone on their list or with that c") |
| kids-checkin.html (not in their Menu) | core | 375 | **FAIL** | access: opens for core, whose Menu does not offer it (it says: "Sunday check-in Care AC Sunday check-in Children into their groups, labels with a collection code, and home again only with someone on their list or with that c") |
| kids-checkin.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Sunday check-in Care AE Sunday check-in Children into their groups, labels with a collection code, and home again only with someone on their list or with that c") |
| kids-checkin.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Sunday check-in Care AW Sunday check-in Children into their groups, labels with a collection code, and home again only with someone on their list or with that c") |
| Library.html (not in their Menu) | everyone | 375 | **FAIL** | console: FirebaseError:  |
| music-uploader.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Music Upload Esher Green Baptist Church Hub Menu Care & support AA Upload Song Drag & Drop or tap here to select files File Type Key Upload") |
| payments.html | master | 375 | **FAIL** | dead: "Save" does nothing |
| picture-library.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Picture library Care AA Picture library Pictures the church uses again and again. Choose one in an event with "Choose from library"; every date of a repeating e") |
| places-admin.html | master | 360 | **FAIL** | hidden: the end of the page is under the bottom bar |
| places-admin.html | master | 375 | **FAIL** | hidden: the end of the page is under the bottom bar |
| places-admin.html | master | 412 | **FAIL** | hidden: the end of the page is under the bottom bar |
| places-admin.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Places Care AA Places Sites, rooms, bookable kit and outside venues. Everything else refers to these by their record, never by name — so renaming is always safe") |
| Planner.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Rota Planner Care AA Term Spring Summer Autumn + Service More Audit Worship not done AV waiting Archive October 2026 OCT 25 Sunday Morning Worship 08:00 · Speak") |
| prayer.html | areaAdmin | 360 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 294x23; INPUT 294x23; INPUT 294x23) |
| prayer.html | areaAdmin | 375 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 309x23; INPUT 309x23; INPUT 309x23) |
| prayer.html | areaAdmin | 412 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 346x23; INPUT 346x23; INPUT 346x23) |
| prayer.html | core | 360 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 294x23; INPUT 294x23; INPUT 294x23) |
| prayer.html | core | 375 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 309x23; INPUT 309x23; INPUT 309x23) |
| prayer.html | core | 412 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 346x23; INPUT 346x23; INPUT 346x23) |
| prayer.html | everyone | 360 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 294x23; INPUT 294x23; INPUT 294x23) |
| prayer.html | everyone | 375 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 309x23; INPUT 309x23; INPUT 309x23) |
| prayer.html | everyone | 412 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 346x23; INPUT 346x23; INPUT 346x23) |
| prayer.html | kids | 360 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 294x23; INPUT 294x23; INPUT 294x23) |
| prayer.html | kids | 375 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 309x23; INPUT 309x23; INPUT 309x23) |
| prayer.html | kids | 412 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 346x23; INPUT 346x23; INPUT 346x23) |
| prayer.html | master | 360 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 294x23; INPUT 294x23; INPUT 294x23) |
| prayer.html | master | 375 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 309x23; INPUT 309x23; INPUT 309x23) |
| prayer.html | master | 412 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 346x23; INPUT 346x23; INPUT 346x23) |
| prayer.html | worship | 360 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 294x23; INPUT 294x23; INPUT 294x23) |
| prayer.html | worship | 375 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 309x23; INPUT 309x23; INPUT 309x23) |
| prayer.html | worship | 412 | **FAIL** | small: 4 controls are under 30px to tap (INPUT 346x23; INPUT 346x23; INPUT 346x23) |
| safeguarding-settings.html | areaAdmin | 412 | **FAIL** | small: 1 control is under 30px to tap (INPUT 342x21) |
| safeguarding-settings.html | master | 412 | **FAIL** | small: 1 control is under 30px to tap (INPUT 342x21) |
| safeguarding-settings.html (not in their Menu) | core | 375 | **FAIL** | access: opens for core, whose Menu does not offer it (it says: "Safeguarding settings Care AC Safeguarding settings These are set by admins and the safeguarding lead.") |
| safeguarding-settings.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Safeguarding settings Care AE Safeguarding settings These are set by admins and the safeguarding lead.") |
| safeguarding-settings.html (not in their Menu) | kids | 375 | **FAIL** | access: opens for kids, whose Menu does not offer it (it says: "Safeguarding settings Care AK Safeguarding settings These are set by admins and the safeguarding lead.") |
| safeguarding-settings.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Safeguarding settings Care AW Safeguarding settings These are set by admins and the safeguarding lead.") |
| safeguarding.html | master | 375 | **FAIL** | sheet: "Report a concern" opens a sheet (mBack) with no visible close after scrolling it |
| safeguarding.html (not in their Menu) | core | 375 | **FAIL** | access: opens for core, whose Menu does not offer it (it says: "Safeguarding Care AC Safeguarding Leaders, ratios, checks, incidents and concerns. Report a concern Coming up No events for you here.") |
| safeguarding.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Safeguarding Care AE Safeguarding Leaders, ratios, checks, incidents and concerns. Report a concern Coming up No events for you here.") |
| safeguarding.html (not in their Menu) | kids | 375 | **FAIL** | access: opens for kids, whose Menu does not offer it (it says: "Safeguarding Care AK Safeguarding Leaders, ratios, checks, incidents and concerns. Report a concern Coming up No events for you here.") |
| safeguarding.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Safeguarding Care AW Safeguarding Leaders, ratios, checks, incidents and concerns. Report a concern Coming up No events for you here.") |
| schematic.html (not in their Menu) | everyone | 375 | **FAIL** | console: [2026-10-16T11:43:53.859Z]  @firebase/firestore: Firestore (10.12.2): Uncaught Error in snapshot listener: FirebaseError: [code=permission-denied]: 
evaluation error at L1394:22 for 'get' @ L1394, fal (+2 more) |
| sermons-admin.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Sermons Care AA Sermons Sunday's sermons come in from Val's podcast on Spotify by themselves. Add the series and the Bible passage here. The live service and th") |
| sermons-admin.html (not in their Menu) | core | 375 | **FAIL** | access: opens for core, whose Menu does not offer it (it says: "Sermons Care AC Sermons Sunday's sermons come in from Val's podcast on Spotify by themselves. Add the series and the Bible passage here. The live service and th") |
| sermons-admin.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Sermons Care AE Sermons Sunday's sermons come in from Val's podcast on Spotify by themselves. Add the series and the Bible passage here. The live service and th") |
| sermons-admin.html (not in their Menu) | kids | 375 | **FAIL** | access: opens for kids, whose Menu does not offer it (it says: "Sermons Care AK Sermons Sunday's sermons come in from Val's podcast on Spotify by themselves. Add the series and the Bible passage here. The live service and th") |
| sermons-admin.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Sermons Care AW Sermons Sunday's sermons come in from Val's podcast on Spotify by themselves. Add the series and the Bible passage here. The live service and th") |
| SundayServicePlanner.html | core | 360 | **FAIL** | small: 5 controls are under 30px to tap (Pick another date 113x24; × 13x32; ▼ 5x29) |
| SundayServicePlanner.html | core | 375 | **FAIL** | small: 5 controls are under 30px to tap (Pick another date 113x24; × 14x32; ▼ 5x29) |
| SundayServicePlanner.html | core | 412 | **FAIL** | small: 5 controls are under 30px to tap (Pick another date 113x24; × 16x32; ▼ 7x29) |
| SundayServicePlanner.html | master | 360 | **FAIL** | small: 22 controls are under 30px to tap (Pick another date 113x24; ▼ 5x29; × 3x32) |
| SundayServicePlanner.html | master | 375 | **FAIL** | small: 22 controls are under 30px to tap (Pick another date 113x24; ▼ 5x29; × 3x32); sheet: "Email Team" opens a sheet (emailModal) with no visible close after scrolling it |
| SundayServicePlanner.html | master | 412 | **FAIL** | small: 5 controls are under 30px to tap (Pick another date 113x24; × 16x32; ▼ 7x29) |
| SundayServicePlanner.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Sunday Service Planner Care AA ? Worship Planner Leader: None ◀ Fri 16 Oct 2026 · Sunday Morning Worship Sun 18 Oct 2026 · Sunday Morning Worship Mon 19 Oct 202") |
| team-mail.html | master | 375 | **FAIL** | dead: "Save" does nothing |
| view-only-rota.html (not in their Menu) | everyone | 375 | **FAIL** | console: [2026-10-16T11:42:14.340Z]  @firebase/firestore: Firestore (10.7.1): Uncaught Error in snapshot listener: FirebaseError: [code=permission-denied]: 
evaluation error at L488:22 for 'list' @ L488, false (+3 more) |
| watch-admin.html | master | 360 | **FAIL** | small: 3 controls are under 30px to tap (INPUT 294x21; INPUT 294x21; INPUT 294x21) |
| watch-admin.html | master | 375 | **FAIL** | small: 3 controls are under 30px to tap (INPUT 309x21; INPUT 309x21; INPUT 309x21); dead: "Add it" does nothing; dead: "Save" does nothing |
| watch-admin.html | master | 412 | **FAIL** | small: 3 controls are under 30px to tap (INPUT 346x21; INPUT 346x21; INPUT 346x21) |
| watch-admin.html (not in their Menu) | areaAdmin | 375 | **FAIL** | access: opens for areaAdmin, whose Menu does not offer it (it says: "Watch Care AA Watch The live service, full services for the church, and the church's YouTube channel, in "Listen & Watch" in the app. Sermons are on their own p") |
| watch-admin.html (not in their Menu) | core | 375 | **FAIL** | access: opens for core, whose Menu does not offer it (it says: "Watch Care AC Watch The live service, full services for the church, and the church's YouTube channel, in "Listen & Watch" in the app. Sermons are on their own p") |
| watch-admin.html (not in their Menu) | everyone | 375 | **FAIL** | access: opens for everyone, whose Menu does not offer it (it says: "Watch Care AE Watch The live service, full services for the church, and the church's YouTube channel, in "Listen & Watch" in the app. Sermons are on their own p") |
| watch-admin.html (not in their Menu) | kids | 375 | **FAIL** | access: opens for kids, whose Menu does not offer it (it says: "Watch Care AK Watch The live service, full services for the church, and the church's YouTube channel, in "Listen & Watch" in the app. Sermons are on their own p") |
| watch-admin.html (not in their Menu) | worship | 375 | **FAIL** | access: opens for worship, whose Menu does not offer it (it says: "Watch Care AW Watch The live service, full services for the church, and the church's YouTube channel, in "Listen & Watch" in the app. Sermons are on their own p") |
| Worshipteamcharter.html (not in their Menu) | everyone | 375 | **FAIL** | console: Charter load failed FirebaseError: 
evaluation error at L1416:22 for 'get' @ L1416, false for 'get' @ L4264, false for 'get' @ L1416, false for 'get' @ L4264 |
| Youthcharter.html (not in their Menu) | everyone | 375 | **FAIL** | console: Charter load failed FirebaseError: 
evaluation error at L1416:22 for 'get' @ L1416, false for 'get' @ L4264, false for 'get' @ L1416, false for 'get' @ L4264 |
| youthserviceplanner.html | master | 360 | **FAIL** | small: 8 controls are under 30px to tap (Pick another date 113x24; ▼ 24x29; ▼ 24x29) |
| youthserviceplanner.html | master | 375 | **FAIL** | small: 8 controls are under 30px to tap (Pick another date 113x24; ▼ 24x29; ▼ 24x29); sheet: "Email Team" opens a sheet (emailModal) with no visible close after scrolling it |
| youthserviceplanner.html | master | 412 | **FAIL** | small: 8 controls are under 30px to tap (Pick another date 113x24; ▼ 24x29; ▼ 24x29) |
| addressbook.html | master | 360 | pass |  |
| addressbook.html | master | 375 | pass |  |
| addressbook.html | master | 412 | pass |  |
| addressbook.html | master | 1440 | pass |  |
| addressbook.html (not in their Menu) | core | 375 | pass |  |
| addressbook.html (not in their Menu) | kids | 375 | pass |  |
| addressbook.html (not in their Menu) | worship | 375 | pass |  |
| app: core / meetings | core | 360 | pass |  |
| app: core / meetings | core | 375 | pass |  |
| app: core / meetings | core | 412 | pass |  |
| app: core / meetings | core | 1440 | pass |  |
| app: core / meetings | master | 360 | pass |  |
| app: core / meetings | master | 375 | pass |  |
| app: core / meetings | master | 412 | pass |  |
| app: core / meetings | master | 1440 | pass |  |
| app: core / plan | core | 1440 | pass |  |
| app: core / plan | master | 1440 | pass |  |
| app: core / rota | core | 1440 | pass |  |
| app: core / rota | master | 1440 | pass |  |
| app: core / team | core | 360 | pass |  |
| app: core / team | core | 375 | pass |  |
| app: core / team | core | 412 | pass |  |
| app: core / team | core | 1440 | pass |  |
| app: core / team | master | 360 | pass |  |
| app: core / team | master | 375 | pass |  |
| app: core / team | master | 412 | pass |  |
| app: core / team | master | 1440 | pass |  |
| app: kids / children | kids | 360 | pass |  |
| app: kids / children | kids | 375 | pass |  |
| app: kids / children | kids | 412 | pass |  |
| app: kids / children | kids | 1440 | pass |  |
| app: kids / rota | kids | 360 | pass |  |
| app: kids / rota | kids | 375 | pass |  |
| app: kids / rota | kids | 412 | pass |  |
| app: kids / rota | kids | 1440 | pass |  |
| app: kids / team | kids | 360 | pass |  |
| app: kids / team | kids | 375 | pass |  |
| app: kids / team | kids | 412 | pass |  |
| app: kids / team | kids | 1440 | pass |  |
| app: kids / today | kids | 360 | pass |  |
| app: kids / today | kids | 375 | pass |  |
| app: kids / today | kids | 412 | pass |  |
| app: kids / today | kids | 1440 | pass |  |
| app: me / home | areaAdmin | 360 | pass |  |
| app: me / home | areaAdmin | 375 | pass |  |
| app: me / home | areaAdmin | 412 | pass |  |
| app: me / home | areaAdmin | 1440 | pass |  |
| app: me / home | core | 360 | pass |  |
| app: me / home | core | 375 | pass |  |
| app: me / home | core | 412 | pass |  |
| app: me / home | core | 1440 | pass |  |
| app: me / home | everyone | 360 | pass |  |
| app: me / home | everyone | 375 | pass |  |
| app: me / home | everyone | 412 | pass |  |
| app: me / home | everyone | 1440 | pass |  |
| app: me / home | kids | 360 | pass |  |
| app: me / home | kids | 375 | pass |  |
| app: me / home | kids | 412 | pass |  |
| app: me / home | kids | 1440 | pass |  |
| app: me / home | master | 360 | pass |  |
| app: me / home | master | 375 | pass |  |
| app: me / home | master | 412 | pass |  |
| app: me / home | master | 1440 | pass |  |
| app: me / home | worship | 360 | pass |  |
| app: me / home | worship | 375 | pass |  |
| app: me / home | worship | 412 | pass |  |
| app: me / home | worship | 1440 | pass |  |
| app: me / listen | areaAdmin | 360 | pass |  |
| app: me / listen | areaAdmin | 375 | pass |  |
| app: me / listen | areaAdmin | 412 | pass |  |
| app: me / listen | areaAdmin | 1440 | pass |  |
| app: me / listen | core | 360 | pass |  |
| app: me / listen | core | 375 | pass |  |
| app: me / listen | core | 412 | pass |  |
| app: me / listen | core | 1440 | pass |  |
| app: me / listen | everyone | 360 | pass |  |
| app: me / listen | everyone | 375 | pass |  |
| app: me / listen | everyone | 412 | pass |  |
| app: me / listen | everyone | 1440 | pass |  |
| app: me / listen | kids | 360 | pass |  |
| app: me / listen | kids | 375 | pass |  |
| app: me / listen | kids | 412 | pass |  |
| app: me / listen | kids | 1440 | pass |  |
| app: me / listen | master | 360 | pass |  |
| app: me / listen | master | 375 | pass |  |
| app: me / listen | master | 412 | pass |  |
| app: me / listen | master | 1440 | pass |  |
| app: me / listen | worship | 360 | pass |  |
| app: me / listen | worship | 375 | pass |  |
| app: me / listen | worship | 412 | pass |  |
| app: me / listen | worship | 1440 | pass |  |
| app: me / me | areaAdmin | 360 | pass |  |
| app: me / me | areaAdmin | 375 | pass |  |
| app: me / me | areaAdmin | 412 | pass |  |
| app: me / me | areaAdmin | 1440 | pass |  |
| app: me / me | core | 360 | pass |  |
| app: me / me | core | 375 | pass |  |
| app: me / me | core | 412 | pass |  |
| app: me / me | core | 1440 | pass |  |
| app: me / me | everyone | 360 | pass |  |
| app: me / me | everyone | 375 | pass |  |
| app: me / me | everyone | 412 | pass |  |
| app: me / me | everyone | 1440 | pass |  |
| app: me / me | kids | 360 | pass |  |
| app: me / me | kids | 375 | pass |  |
| app: me / me | kids | 412 | pass |  |
| app: me / me | kids | 1440 | pass |  |
| app: me / me | master | 360 | pass |  |
| app: me / me | master | 375 | pass |  |
| app: me / me | master | 412 | pass |  |
| app: me / me | master | 1440 | pass |  |
| app: me / me | worship | 360 | pass |  |
| app: me / me | worship | 375 | pass |  |
| app: me / me | worship | 412 | pass |  |
| app: me / me | worship | 1440 | pass |  |
| app: me / whatson | areaAdmin | 360 | pass |  |
| app: me / whatson | areaAdmin | 375 | pass |  |
| app: me / whatson | areaAdmin | 412 | pass |  |
| app: me / whatson | areaAdmin | 1440 | pass |  |
| app: me / whatson | core | 360 | pass |  |
| app: me / whatson | core | 375 | pass |  |
| app: me / whatson | core | 412 | pass |  |
| app: me / whatson | core | 1440 | pass |  |
| app: me / whatson | everyone | 360 | pass |  |
| app: me / whatson | everyone | 375 | pass |  |
| app: me / whatson | everyone | 412 | pass |  |
| app: me / whatson | everyone | 1440 | pass |  |
| app: me / whatson | kids | 360 | pass |  |
| app: me / whatson | kids | 375 | pass |  |
| app: me / whatson | kids | 412 | pass |  |
| app: me / whatson | kids | 1440 | pass |  |
| app: me / whatson | master | 360 | pass |  |
| app: me / whatson | master | 375 | pass |  |
| app: me / whatson | master | 412 | pass |  |
| app: me / whatson | master | 1440 | pass |  |
| app: me / whatson | worship | 360 | pass |  |
| app: me / whatson | worship | 375 | pass |  |
| app: me / whatson | worship | 412 | pass |  |
| app: me / whatson | worship | 1440 | pass |  |
| app: office / bookings | master | 360 | pass |  |
| app: office / bookings | master | 375 | pass |  |
| app: office / bookings | master | 412 | pass |  |
| app: office / bookings | master | 1440 | pass |  |
| app: office / people | master | 360 | pass |  |
| app: office / people | master | 375 | pass |  |
| app: office / people | master | 412 | pass |  |
| app: office / people | master | 1440 | pass |  |
| app: office / send | master | 360 | pass |  |
| app: office / send | master | 375 | pass |  |
| app: office / send | master | 412 | pass |  |
| app: office / send | master | 1440 | pass |  |
| app: worship / learn | areaAdmin | 360 | pass |  |
| app: worship / learn | areaAdmin | 375 | pass |  |
| app: worship / learn | areaAdmin | 412 | pass |  |
| app: worship / learn | areaAdmin | 1440 | pass |  |
| app: worship / learn | core | 360 | pass |  |
| app: worship / learn | core | 375 | pass |  |
| app: worship / learn | core | 412 | pass |  |
| app: worship / learn | core | 1440 | pass |  |
| app: worship / learn | master | 360 | pass |  |
| app: worship / learn | master | 375 | pass |  |
| app: worship / learn | master | 412 | pass |  |
| app: worship / learn | master | 1440 | pass |  |
| app: worship / learn | worship | 360 | pass |  |
| app: worship / learn | worship | 375 | pass |  |
| app: worship / learn | worship | 412 | pass |  |
| app: worship / learn | worship | 1440 | pass |  |
| app: worship / rota | areaAdmin | 360 | pass |  |
| app: worship / rota | areaAdmin | 375 | pass |  |
| app: worship / rota | areaAdmin | 412 | pass |  |
| app: worship / rota | areaAdmin | 1440 | pass |  |
| app: worship / rota | core | 360 | pass |  |
| app: worship / rota | core | 375 | pass |  |
| app: worship / rota | core | 412 | pass |  |
| app: worship / rota | core | 1440 | pass |  |
| app: worship / rota | master | 360 | pass |  |
| app: worship / rota | master | 375 | pass |  |
| app: worship / rota | master | 412 | pass |  |
| app: worship / rota | master | 1440 | pass |  |
| app: worship / rota | worship | 360 | pass |  |
| app: worship / rota | worship | 375 | pass |  |
| app: worship / rota | worship | 412 | pass |  |
| app: worship / rota | worship | 1440 | pass |  |
| app: worship / sunday | areaAdmin | 360 | pass |  |
| app: worship / sunday | areaAdmin | 375 | pass |  |
| app: worship / sunday | areaAdmin | 412 | pass |  |
| app: worship / sunday | areaAdmin | 1440 | pass |  |
| app: worship / sunday | core | 360 | pass |  |
| app: worship / sunday | core | 375 | pass |  |
| app: worship / sunday | core | 412 | pass |  |
| app: worship / sunday | core | 1440 | pass |  |
| app: worship / sunday | master | 360 | pass |  |
| app: worship / sunday | master | 375 | pass |  |
| app: worship / sunday | master | 412 | pass |  |
| app: worship / sunday | master | 1440 | pass |  |
| app: worship / sunday | worship | 360 | pass |  |
| app: worship / sunday | worship | 375 | pass |  |
| app: worship / sunday | worship | 412 | pass |  |
| app: worship / sunday | worship | 1440 | pass |  |
| app: worship / team | areaAdmin | 360 | pass |  |
| app: worship / team | areaAdmin | 375 | pass |  |
| app: worship / team | areaAdmin | 412 | pass |  |
| app: worship / team | areaAdmin | 1440 | pass |  |
| app: worship / team | core | 360 | pass |  |
| app: worship / team | core | 375 | pass |  |
| app: worship / team | core | 412 | pass |  |
| app: worship / team | core | 1440 | pass |  |
| app: worship / team | master | 360 | pass |  |
| app: worship / team | master | 375 | pass |  |
| app: worship / team | master | 412 | pass |  |
| app: worship / team | master | 1440 | pass |  |
| app: worship / team | worship | 360 | pass |  |
| app: worship / team | worship | 375 | pass |  |
| app: worship / team | worship | 412 | pass |  |
| app: worship / team | worship | 1440 | pass |  |
| attendance.html | master | 360 | pass |  |
| attendance.html | master | 375 | pass |  |
| attendance.html | master | 412 | pass |  |
| attendance.html | master | 1440 | pass |  |
| back to the app from addressbook.html | master | 360 | pass |  |
| back to the app from addressbook.html | master | 375 | pass |  |
| back to the app from addressbook.html | master | 412 | pass |  |
| back to the app from addressbook.html | master | 1440 | pass |  |
| back to the app from bookings-admin.html | master | 360 | pass |  |
| back to the app from bookings-admin.html | master | 375 | pass |  |
| back to the app from bookings-admin.html | master | 412 | pass |  |
| back to the app from bookings-admin.html | master | 1440 | pass |  |
| back to the app from Coreteamcharter.html | core | 360 | pass |  |
| back to the app from Coreteamcharter.html | core | 375 | pass |  |
| back to the app from Coreteamcharter.html | core | 412 | pass |  |
| back to the app from Coreteamcharter.html | core | 1440 | pass |  |
| back to the app from Coreteamcharter.html | master | 360 | pass |  |
| back to the app from Coreteamcharter.html | master | 375 | pass |  |
| back to the app from Coreteamcharter.html | master | 412 | pass |  |
| back to the app from Coreteamcharter.html | master | 1440 | pass |  |
| back to the app from EGBC-HowTo-AV.html | areaAdmin | 360 | pass |  |
| back to the app from EGBC-HowTo-AV.html | areaAdmin | 375 | pass |  |
| back to the app from EGBC-HowTo-AV.html | areaAdmin | 412 | pass |  |
| back to the app from EGBC-HowTo-AV.html | areaAdmin | 1440 | pass |  |
| back to the app from EGBC-HowTo-AV.html | core | 360 | pass |  |
| back to the app from EGBC-HowTo-AV.html | core | 375 | pass |  |
| back to the app from EGBC-HowTo-AV.html | core | 412 | pass |  |
| back to the app from EGBC-HowTo-AV.html | core | 1440 | pass |  |
| back to the app from EGBC-HowTo-AV.html | master | 360 | pass |  |
| back to the app from EGBC-HowTo-AV.html | master | 375 | pass |  |
| back to the app from EGBC-HowTo-AV.html | master | 412 | pass |  |
| back to the app from EGBC-HowTo-AV.html | master | 1440 | pass |  |
| back to the app from EGBC-HowTo-AV.html | worship | 360 | pass |  |
| back to the app from EGBC-HowTo-AV.html | worship | 375 | pass |  |
| back to the app from EGBC-HowTo-AV.html | worship | 412 | pass |  |
| back to the app from EGBC-HowTo-AV.html | worship | 1440 | pass |  |
| back to the app from EGBC-PlayThrough.html | areaAdmin | 360 | pass |  |
| back to the app from EGBC-PlayThrough.html | areaAdmin | 375 | pass |  |
| back to the app from EGBC-PlayThrough.html | areaAdmin | 412 | pass |  |
| back to the app from EGBC-PlayThrough.html | areaAdmin | 1440 | pass |  |
| back to the app from EGBC-PlayThrough.html | core | 360 | pass |  |
| back to the app from EGBC-PlayThrough.html | core | 375 | pass |  |
| back to the app from EGBC-PlayThrough.html | core | 412 | pass |  |
| back to the app from EGBC-PlayThrough.html | core | 1440 | pass |  |
| back to the app from EGBC-PlayThrough.html | master | 360 | pass |  |
| back to the app from EGBC-PlayThrough.html | master | 375 | pass |  |
| back to the app from EGBC-PlayThrough.html | master | 412 | pass |  |
| back to the app from EGBC-PlayThrough.html | master | 1440 | pass |  |
| back to the app from EGBC-PlayThrough.html | worship | 360 | pass |  |
| back to the app from EGBC-PlayThrough.html | worship | 375 | pass |  |
| back to the app from EGBC-PlayThrough.html | worship | 412 | pass |  |
| back to the app from EGBC-PlayThrough.html | worship | 1440 | pass |  |
| back to the app from EGBC-Training-Worship.html | areaAdmin | 360 | pass |  |
| back to the app from EGBC-Training-Worship.html | areaAdmin | 375 | pass |  |
| back to the app from EGBC-Training-Worship.html | areaAdmin | 412 | pass |  |
| back to the app from EGBC-Training-Worship.html | areaAdmin | 1440 | pass |  |
| back to the app from EGBC-Training-Worship.html | core | 360 | pass |  |
| back to the app from EGBC-Training-Worship.html | core | 375 | pass |  |
| back to the app from EGBC-Training-Worship.html | core | 412 | pass |  |
| back to the app from EGBC-Training-Worship.html | core | 1440 | pass |  |
| back to the app from EGBC-Training-Worship.html | master | 360 | pass |  |
| back to the app from EGBC-Training-Worship.html | master | 375 | pass |  |
| back to the app from EGBC-Training-Worship.html | master | 412 | pass |  |
| back to the app from EGBC-Training-Worship.html | master | 1440 | pass |  |
| back to the app from EGBC-Training-Worship.html | worship | 360 | pass |  |
| back to the app from EGBC-Training-Worship.html | worship | 375 | pass |  |
| back to the app from EGBC-Training-Worship.html | worship | 412 | pass |  |
| back to the app from EGBC-Training-Worship.html | worship | 1440 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | areaAdmin | 360 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | areaAdmin | 375 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | areaAdmin | 412 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | areaAdmin | 1440 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | core | 360 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | core | 375 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | core | 412 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | core | 1440 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | master | 360 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | master | 375 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | master | 412 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | master | 1440 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | worship | 360 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | worship | 375 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | worship | 412 | pass |  |
| back to the app from EGBC-Troubleshoot-AV.html | worship | 1440 | pass |  |
| back to the app from EmailBuilder2.html | master | 360 | pass |  |
| back to the app from EmailBuilder2.html | master | 375 | pass |  |
| back to the app from EmailBuilder2.html | master | 412 | pass |  |
| back to the app from EmailBuilder2.html | master | 1440 | pass |  |
| back to the app from groups.html | areaAdmin | 360 | pass |  |
| back to the app from groups.html | areaAdmin | 375 | pass |  |
| back to the app from groups.html | areaAdmin | 412 | pass |  |
| back to the app from groups.html | areaAdmin | 1440 | pass |  |
| back to the app from groups.html | core | 360 | pass |  |
| back to the app from groups.html | core | 375 | pass |  |
| back to the app from groups.html | core | 412 | pass |  |
| back to the app from groups.html | core | 1440 | pass |  |
| back to the app from groups.html | everyone | 360 | pass |  |
| back to the app from groups.html | everyone | 375 | pass |  |
| back to the app from groups.html | everyone | 412 | pass |  |
| back to the app from groups.html | everyone | 1440 | pass |  |
| back to the app from groups.html | kids | 360 | pass |  |
| back to the app from groups.html | kids | 375 | pass |  |
| back to the app from groups.html | kids | 412 | pass |  |
| back to the app from groups.html | kids | 1440 | pass |  |
| back to the app from groups.html | master | 360 | pass |  |
| back to the app from groups.html | master | 375 | pass |  |
| back to the app from groups.html | master | 412 | pass |  |
| back to the app from groups.html | master | 1440 | pass |  |
| back to the app from groups.html | worship | 360 | pass |  |
| back to the app from groups.html | worship | 375 | pass |  |
| back to the app from groups.html | worship | 412 | pass |  |
| back to the app from groups.html | worship | 1440 | pass |  |
| back to the app from index.html | areaAdmin | 360 | pass |  |
| back to the app from index.html | areaAdmin | 375 | pass |  |
| back to the app from index.html | areaAdmin | 412 | pass |  |
| back to the app from index.html | areaAdmin | 1440 | pass |  |
| back to the app from index.html | core | 360 | pass |  |
| back to the app from index.html | core | 375 | pass |  |
| back to the app from index.html | core | 412 | pass |  |
| back to the app from index.html | core | 1440 | pass |  |
| back to the app from index.html | everyone | 360 | pass |  |
| back to the app from index.html | everyone | 375 | pass |  |
| back to the app from index.html | everyone | 412 | pass |  |
| back to the app from index.html | everyone | 1440 | pass |  |
| back to the app from index.html | kids | 360 | pass |  |
| back to the app from index.html | kids | 375 | pass |  |
| back to the app from index.html | kids | 412 | pass |  |
| back to the app from index.html | kids | 1440 | pass |  |
| back to the app from index.html | master | 360 | pass |  |
| back to the app from index.html | master | 375 | pass |  |
| back to the app from index.html | master | 412 | pass |  |
| back to the app from index.html | master | 1440 | pass |  |
| back to the app from index.html | worship | 360 | pass |  |
| back to the app from index.html | worship | 375 | pass |  |
| back to the app from index.html | worship | 412 | pass |  |
| back to the app from index.html | worship | 1440 | pass |  |
| back to the app from kids-admin.html | kids | 360 | pass |  |
| back to the app from kids-admin.html | kids | 375 | pass |  |
| back to the app from kids-admin.html | kids | 412 | pass |  |
| back to the app from kids-admin.html | kids | 1440 | pass |  |
| back to the app from kids-checkin.html | kids | 360 | pass |  |
| back to the app from kids-checkin.html | kids | 375 | pass |  |
| back to the app from kids-checkin.html | kids | 412 | pass |  |
| back to the app from kids-checkin.html | kids | 1440 | pass |  |
| back to the app from Library.html | areaAdmin | 360 | pass |  |
| back to the app from Library.html | areaAdmin | 375 | pass |  |
| back to the app from Library.html | areaAdmin | 412 | pass |  |
| back to the app from Library.html | areaAdmin | 1440 | pass |  |
| back to the app from Library.html | core | 360 | pass |  |
| back to the app from Library.html | core | 375 | pass |  |
| back to the app from Library.html | core | 412 | pass |  |
| back to the app from Library.html | core | 1440 | pass |  |
| back to the app from Library.html | master | 360 | pass |  |
| back to the app from Library.html | master | 375 | pass |  |
| back to the app from Library.html | master | 412 | pass |  |
| back to the app from Library.html | master | 1440 | pass |  |
| back to the app from Library.html | worship | 360 | pass |  |
| back to the app from Library.html | worship | 375 | pass |  |
| back to the app from Library.html | worship | 412 | pass |  |
| back to the app from Library.html | worship | 1440 | pass |  |
| back to the app from meeting.html | areaAdmin | 360 | pass |  |
| back to the app from meeting.html | areaAdmin | 375 | pass |  |
| back to the app from meeting.html | areaAdmin | 412 | pass |  |
| back to the app from meeting.html | areaAdmin | 1440 | pass |  |
| back to the app from meeting.html | core | 360 | pass |  |
| back to the app from meeting.html | core | 375 | pass |  |
| back to the app from meeting.html | core | 412 | pass |  |
| back to the app from meeting.html | core | 1440 | pass |  |
| back to the app from meeting.html | master | 360 | pass |  |
| back to the app from meeting.html | master | 375 | pass |  |
| back to the app from meeting.html | master | 412 | pass |  |
| back to the app from meeting.html | master | 1440 | pass |  |
| back to the app from meeting.html | worship | 360 | pass |  |
| back to the app from meeting.html | worship | 375 | pass |  |
| back to the app from meeting.html | worship | 412 | pass |  |
| back to the app from meeting.html | worship | 1440 | pass |  |
| back to the app from my-messages.html | areaAdmin | 360 | pass |  |
| back to the app from my-messages.html | areaAdmin | 375 | pass |  |
| back to the app from my-messages.html | areaAdmin | 412 | pass |  |
| back to the app from my-messages.html | areaAdmin | 1440 | pass |  |
| back to the app from my-messages.html | core | 360 | pass |  |
| back to the app from my-messages.html | core | 375 | pass |  |
| back to the app from my-messages.html | core | 412 | pass |  |
| back to the app from my-messages.html | core | 1440 | pass |  |
| back to the app from my-messages.html | everyone | 360 | pass |  |
| back to the app from my-messages.html | everyone | 375 | pass |  |
| back to the app from my-messages.html | everyone | 412 | pass |  |
| back to the app from my-messages.html | everyone | 1440 | pass |  |
| back to the app from my-messages.html | kids | 360 | pass |  |
| back to the app from my-messages.html | kids | 375 | pass |  |
| back to the app from my-messages.html | kids | 412 | pass |  |
| back to the app from my-messages.html | kids | 1440 | pass |  |
| back to the app from my-messages.html | master | 360 | pass |  |
| back to the app from my-messages.html | master | 375 | pass |  |
| back to the app from my-messages.html | master | 412 | pass |  |
| back to the app from my-messages.html | master | 1440 | pass |  |
| back to the app from my-messages.html | worship | 360 | pass |  |
| back to the app from my-messages.html | worship | 375 | pass |  |
| back to the app from my-messages.html | worship | 412 | pass |  |
| back to the app from my-messages.html | worship | 1440 | pass |  |
| back to the app from notifications.html | areaAdmin | 360 | pass |  |
| back to the app from notifications.html | areaAdmin | 375 | pass |  |
| back to the app from notifications.html | areaAdmin | 412 | pass |  |
| back to the app from notifications.html | areaAdmin | 1440 | pass |  |
| back to the app from notifications.html | core | 360 | pass |  |
| back to the app from notifications.html | core | 375 | pass |  |
| back to the app from notifications.html | core | 412 | pass |  |
| back to the app from notifications.html | core | 1440 | pass |  |
| back to the app from notifications.html | everyone | 360 | pass |  |
| back to the app from notifications.html | everyone | 375 | pass |  |
| back to the app from notifications.html | everyone | 412 | pass |  |
| back to the app from notifications.html | everyone | 1440 | pass |  |
| back to the app from notifications.html | kids | 360 | pass |  |
| back to the app from notifications.html | kids | 375 | pass |  |
| back to the app from notifications.html | kids | 412 | pass |  |
| back to the app from notifications.html | kids | 1440 | pass |  |
| back to the app from notifications.html | master | 360 | pass |  |
| back to the app from notifications.html | master | 375 | pass |  |
| back to the app from notifications.html | master | 412 | pass |  |
| back to the app from notifications.html | master | 1440 | pass |  |
| back to the app from notifications.html | worship | 360 | pass |  |
| back to the app from notifications.html | worship | 375 | pass |  |
| back to the app from notifications.html | worship | 412 | pass |  |
| back to the app from notifications.html | worship | 1440 | pass |  |
| back to the app from resources.html | areaAdmin | 360 | pass |  |
| back to the app from resources.html | areaAdmin | 375 | pass |  |
| back to the app from resources.html | areaAdmin | 412 | pass |  |
| back to the app from resources.html | areaAdmin | 1440 | pass |  |
| back to the app from resources.html | core | 360 | pass |  |
| back to the app from resources.html | core | 375 | pass |  |
| back to the app from resources.html | core | 412 | pass |  |
| back to the app from resources.html | core | 1440 | pass |  |
| back to the app from resources.html | kids | 360 | pass |  |
| back to the app from resources.html | kids | 375 | pass |  |
| back to the app from resources.html | kids | 412 | pass |  |
| back to the app from resources.html | kids | 1440 | pass |  |
| back to the app from resources.html | master | 360 | pass |  |
| back to the app from resources.html | master | 375 | pass |  |
| back to the app from resources.html | master | 412 | pass |  |
| back to the app from resources.html | master | 1440 | pass |  |
| back to the app from resources.html | worship | 360 | pass |  |
| back to the app from resources.html | worship | 375 | pass |  |
| back to the app from resources.html | worship | 412 | pass |  |
| back to the app from resources.html | worship | 1440 | pass |  |
| back to the app from safeguarding.html | kids | 360 | pass |  |
| back to the app from safeguarding.html | kids | 375 | pass |  |
| back to the app from safeguarding.html | kids | 412 | pass |  |
| back to the app from safeguarding.html | kids | 1440 | pass |  |
| back to the app from song-summary.html?date=2026-10-25 | worship | 360 | pass |  |
| back to the app from song-summary.html?date=2026-10-25 | worship | 375 | pass |  |
| back to the app from song-summary.html?date=2026-10-25 | worship | 412 | pass |  |
| back to the app from song-summary.html?date=2026-10-25 | worship | 1440 | pass |  |
| back to the app from view-only-rota.html | areaAdmin | 360 | pass |  |
| back to the app from view-only-rota.html | areaAdmin | 375 | pass |  |
| back to the app from view-only-rota.html | areaAdmin | 412 | pass |  |
| back to the app from view-only-rota.html | areaAdmin | 1440 | pass |  |
| back to the app from view-only-rota.html | core | 360 | pass |  |
| back to the app from view-only-rota.html | core | 375 | pass |  |
| back to the app from view-only-rota.html | core | 412 | pass |  |
| back to the app from view-only-rota.html | core | 1440 | pass |  |
| back to the app from view-only-rota.html | kids | 360 | pass |  |
| back to the app from view-only-rota.html | kids | 375 | pass |  |
| back to the app from view-only-rota.html | kids | 412 | pass |  |
| back to the app from view-only-rota.html | kids | 1440 | pass |  |
| back to the app from view-only-rota.html | master | 360 | pass |  |
| back to the app from view-only-rota.html | master | 375 | pass |  |
| back to the app from view-only-rota.html | master | 412 | pass |  |
| back to the app from view-only-rota.html | master | 1440 | pass |  |
| back to the app from view-only-rota.html | worship | 360 | pass |  |
| back to the app from view-only-rota.html | worship | 375 | pass |  |
| back to the app from view-only-rota.html | worship | 412 | pass |  |
| back to the app from view-only-rota.html | worship | 1440 | pass |  |
| back to the app from Worshipteamcharter.html | areaAdmin | 360 | pass |  |
| back to the app from Worshipteamcharter.html | areaAdmin | 375 | pass |  |
| back to the app from Worshipteamcharter.html | areaAdmin | 412 | pass |  |
| back to the app from Worshipteamcharter.html | areaAdmin | 1440 | pass |  |
| back to the app from Worshipteamcharter.html | core | 360 | pass |  |
| back to the app from Worshipteamcharter.html | core | 375 | pass |  |
| back to the app from Worshipteamcharter.html | core | 412 | pass |  |
| back to the app from Worshipteamcharter.html | core | 1440 | pass |  |
| back to the app from Worshipteamcharter.html | master | 360 | pass |  |
| back to the app from Worshipteamcharter.html | master | 375 | pass |  |
| back to the app from Worshipteamcharter.html | master | 412 | pass |  |
| back to the app from Worshipteamcharter.html | master | 1440 | pass |  |
| back to the app from Worshipteamcharter.html | worship | 360 | pass |  |
| back to the app from Worshipteamcharter.html | worship | 375 | pass |  |
| back to the app from Worshipteamcharter.html | worship | 412 | pass |  |
| back to the app from Worshipteamcharter.html | worship | 1440 | pass |  |
| batchupload.html | areaAdmin | 360 | pass |  |
| batchupload.html | areaAdmin | 375 | pass |  |
| batchupload.html | areaAdmin | 412 | pass |  |
| batchupload.html | areaAdmin | 1440 | pass |  |
| batchupload.html | core | 360 | pass |  |
| batchupload.html | core | 375 | pass |  |
| batchupload.html | core | 412 | pass |  |
| batchupload.html | core | 1440 | pass |  |
| batchupload.html | master | 360 | pass |  |
| batchupload.html | master | 375 | pass |  |
| batchupload.html | master | 412 | pass |  |
| batchupload.html | master | 1440 | pass |  |
| batchupload.html (not in their Menu) | everyone | 375 | pass |  |
| batchupload.html (not in their Menu) | kids | 375 | pass |  |
| batchupload.html (not in their Menu) | worship | 375 | pass |  |
| bookings-admin.html | areaAdmin | 360 | pass |  |
| bookings-admin.html | areaAdmin | 375 | pass |  |
| bookings-admin.html | areaAdmin | 412 | pass |  |
| bookings-admin.html | areaAdmin | 1440 | pass |  |
| bookings-admin.html | master | 360 | pass |  |
| bookings-admin.html | master | 375 | pass |  |
| bookings-admin.html | master | 412 | pass |  |
| bookings-admin.html | master | 1440 | pass |  |
| bookings-admin.html (not in their Menu) | core | 375 | pass |  |
| bookings-admin.html (not in their Menu) | everyone | 375 | pass |  |
| bookings-admin.html (not in their Menu) | kids | 375 | pass |  |
| bookings-admin.html (not in their Menu) | worship | 375 | pass |  |
| care-inbox.html (not in their Menu) | areaAdmin | 375 | pass |  |
| care-inbox.html (not in their Menu) | core | 375 | pass |  |
| care-inbox.html (not in their Menu) | everyone | 375 | pass |  |
| care-inbox.html (not in their Menu) | kids | 375 | pass |  |
| care-inbox.html (not in their Menu) | master | 375 | pass |  |
| care-inbox.html (not in their Menu) | worship | 375 | pass |  |
| care.html | areaAdmin | 360 | pass |  |
| care.html | areaAdmin | 375 | pass |  |
| care.html | areaAdmin | 412 | pass |  |
| care.html | areaAdmin | 1440 | pass |  |
| care.html | core | 360 | pass |  |
| care.html | core | 375 | pass |  |
| care.html | core | 412 | pass |  |
| care.html | core | 1440 | pass |  |
| care.html | everyone | 360 | pass |  |
| care.html | everyone | 375 | pass |  |
| care.html | everyone | 412 | pass |  |
| care.html | everyone | 1440 | pass |  |
| care.html | kids | 360 | pass |  |
| care.html | kids | 375 | pass |  |
| care.html | kids | 412 | pass |  |
| care.html | kids | 1440 | pass |  |
| care.html | master | 360 | pass |  |
| care.html | master | 375 | pass |  |
| care.html | master | 412 | pass |  |
| care.html | master | 1440 | pass |  |
| care.html | worship | 360 | pass |  |
| care.html | worship | 375 | pass |  |
| care.html | worship | 412 | pass |  |
| care.html | worship | 1440 | pass |  |
| checkin.html | master | 360 | pass |  |
| checkin.html | master | 375 | pass |  |
| checkin.html | master | 412 | pass |  |
| checkin.html | master | 1440 | pass |  |
| church-settings.html | master | 360 | pass |  |
| church-settings.html | master | 375 | pass |  |
| church-settings.html | master | 412 | pass |  |
| church-settings.html | master | 1440 | pass |  |
| church-settings.html (not in their Menu) | core | 375 | pass |  |
| church-settings.html (not in their Menu) | everyone | 375 | pass |  |
| church-settings.html (not in their Menu) | kids | 375 | pass |  |
| church-settings.html (not in their Menu) | worship | 375 | pass |  |
| churchshow.html | areaAdmin | 360 | pass |  |
| churchshow.html | areaAdmin | 375 | pass |  |
| churchshow.html | areaAdmin | 412 | pass |  |
| churchshow.html | areaAdmin | 1440 | pass |  |
| churchshow.html | master | 360 | pass |  |
| churchshow.html | master | 375 | pass |  |
| churchshow.html | master | 412 | pass |  |
| churchshow.html | master | 1440 | pass |  |
| churchshow.html (not in their Menu) | core | 375 | pass |  |
| churchshow.html (not in their Menu) | everyone | 375 | pass |  |
| churchshow.html (not in their Menu) | kids | 375 | pass |  |
| churchshow.html (not in their Menu) | worship | 375 | pass |  |
| comms.html | master | 360 | pass |  |
| comms.html | master | 375 | pass |  |
| comms.html | master | 412 | pass |  |
| comms.html | master | 1440 | pass |  |
| comms.html (not in their Menu) | areaAdmin | 375 | pass |  |
| comms.html (not in their Menu) | core | 375 | pass |  |
| comms.html (not in their Menu) | everyone | 375 | pass |  |
| comms.html (not in their Menu) | kids | 375 | pass |  |
| comms.html (not in their Menu) | worship | 375 | pass |  |
| Coreteamcharter.html | core | 360 | pass |  |
| Coreteamcharter.html | core | 375 | pass |  |
| Coreteamcharter.html | core | 412 | pass |  |
| Coreteamcharter.html | core | 1440 | pass |  |
| Coreteamcharter.html | master | 360 | pass |  |
| Coreteamcharter.html | master | 375 | pass |  |
| Coreteamcharter.html | master | 412 | pass |  |
| Coreteamcharter.html | master | 1440 | pass |  |
| Coreteamcharter.html (not in their Menu) | areaAdmin | 375 | pass |  |
| Coreteamcharter.html (not in their Menu) | kids | 375 | pass |  |
| Coreteamcharter.html (not in their Menu) | worship | 375 | pass |  |
| data-tools.html | master | 1440 | pass |  |
| data-tools.html (not in their Menu) | areaAdmin | 375 | pass |  |
| data-tools.html (not in their Menu) | core | 375 | pass |  |
| data-tools.html (not in their Menu) | everyone | 375 | pass |  |
| data-tools.html (not in their Menu) | kids | 375 | pass |  |
| data-tools.html (not in their Menu) | worship | 375 | pass |  |
| EGBC-HowTo-AV.html | areaAdmin | 360 | pass |  |
| EGBC-HowTo-AV.html | areaAdmin | 375 | pass |  |
| EGBC-HowTo-AV.html | areaAdmin | 412 | pass |  |
| EGBC-HowTo-AV.html | areaAdmin | 1440 | pass |  |
| EGBC-HowTo-AV.html | core | 360 | pass |  |
| EGBC-HowTo-AV.html | core | 375 | pass |  |
| EGBC-HowTo-AV.html | core | 412 | pass |  |
| EGBC-HowTo-AV.html | core | 1440 | pass |  |
| EGBC-HowTo-AV.html | master | 360 | pass |  |
| EGBC-HowTo-AV.html | master | 412 | pass |  |
| EGBC-HowTo-AV.html | master | 1440 | pass |  |
| EGBC-HowTo-AV.html | worship | 360 | pass |  |
| EGBC-HowTo-AV.html | worship | 375 | pass |  |
| EGBC-HowTo-AV.html | worship | 412 | pass |  |
| EGBC-HowTo-AV.html | worship | 1440 | pass |  |
| EGBC-HowTo-AV.html (not in their Menu) | everyone | 375 | pass |  |
| EGBC-HowTo-AV.html (not in their Menu) | kids | 375 | pass |  |
| EGBC-PlayThrough.html | areaAdmin | 1440 | pass |  |
| EGBC-PlayThrough.html | core | 1440 | pass |  |
| EGBC-PlayThrough.html | master | 1440 | pass |  |
| EGBC-PlayThrough.html | worship | 1440 | pass |  |
| EGBC-PlayThrough.html (not in their Menu) | everyone | 375 | pass |  |
| EGBC-PlayThrough.html (not in their Menu) | kids | 375 | pass |  |
| EGBC-Training-Worship.html | areaAdmin | 1440 | pass |  |
| EGBC-Training-Worship.html | core | 1440 | pass |  |
| EGBC-Training-Worship.html | master | 1440 | pass |  |
| EGBC-Training-Worship.html | worship | 1440 | pass |  |
| EGBC-Training-Worship.html (not in their Menu) | everyone | 375 | pass |  |
| EGBC-Training-Worship.html (not in their Menu) | kids | 375 | pass |  |
| EGBC-Troubleshoot-AV.html | areaAdmin | 360 | pass |  |
| EGBC-Troubleshoot-AV.html | areaAdmin | 375 | pass |  |
| EGBC-Troubleshoot-AV.html | areaAdmin | 412 | pass |  |
| EGBC-Troubleshoot-AV.html | areaAdmin | 1440 | pass |  |
| EGBC-Troubleshoot-AV.html | core | 360 | pass |  |
| EGBC-Troubleshoot-AV.html | core | 375 | pass |  |
| EGBC-Troubleshoot-AV.html | core | 412 | pass |  |
| EGBC-Troubleshoot-AV.html | core | 1440 | pass |  |
| EGBC-Troubleshoot-AV.html | master | 360 | pass |  |
| EGBC-Troubleshoot-AV.html | master | 412 | pass |  |
| EGBC-Troubleshoot-AV.html | master | 1440 | pass |  |
| EGBC-Troubleshoot-AV.html | worship | 360 | pass |  |
| EGBC-Troubleshoot-AV.html | worship | 375 | pass |  |
| EGBC-Troubleshoot-AV.html | worship | 412 | pass |  |
| EGBC-Troubleshoot-AV.html | worship | 1440 | pass |  |
| EGBC-Troubleshoot-AV.html (not in their Menu) | everyone | 375 | pass |  |
| EGBC-Troubleshoot-AV.html (not in their Menu) | kids | 375 | pass |  |
| EmailBuilder2.html | master | 360 | pass |  |
| EmailBuilder2.html | master | 375 | pass |  |
| EmailBuilder2.html | master | 412 | pass |  |
| EmailBuilder2.html | master | 1440 | pass |  |
| EmailBuilder2.html (not in their Menu) | core | 375 | pass |  |
| EmailBuilder2.html (not in their Menu) | everyone | 375 | pass |  |
| EmailBuilder2.html (not in their Menu) | kids | 375 | pass |  |
| EmailBuilder2.html (not in their Menu) | worship | 375 | pass |  |
| findability (taps from Home) | areaAdmin | 1440 | pass |  |
| findability (taps from Home) | everyone | 375 | pass |  |
| findability (taps from Home) | everyone | 1440 | pass |  |
| findability (taps from Home) | kids | 375 | pass |  |
| findability (taps from Home) | kids | 1440 | pass |  |
| findability (taps from Home) | worship | 375 | pass |  |
| findability (taps from Home) | worship | 1440 | pass |  |
| forms-admin.html | areaAdmin | 360 | pass |  |
| forms-admin.html | areaAdmin | 375 | pass |  |
| forms-admin.html | areaAdmin | 412 | pass |  |
| forms-admin.html | areaAdmin | 1440 | pass |  |
| forms-admin.html | master | 360 | pass |  |
| forms-admin.html | master | 375 | pass |  |
| forms-admin.html | master | 412 | pass |  |
| forms-admin.html | master | 1440 | pass |  |
| forms-admin.html (not in their Menu) | core | 375 | pass |  |
| forms-admin.html (not in their Menu) | everyone | 375 | pass |  |
| forms-admin.html (not in their Menu) | kids | 375 | pass |  |
| forms-admin.html (not in their Menu) | worship | 375 | pass |  |
| from the app: addressbook.html | master | 360 | pass |  |
| from the app: addressbook.html | master | 375 | pass |  |
| from the app: addressbook.html | master | 412 | pass |  |
| from the app: addressbook.html | master | 1440 | pass |  |
| from the app: bookings-admin.html | master | 360 | pass |  |
| from the app: bookings-admin.html | master | 375 | pass |  |
| from the app: bookings-admin.html | master | 412 | pass |  |
| from the app: bookings-admin.html | master | 1440 | pass |  |
| from the app: Coreteamcharter.html | core | 360 | pass |  |
| from the app: Coreteamcharter.html | core | 375 | pass |  |
| from the app: Coreteamcharter.html | core | 412 | pass |  |
| from the app: Coreteamcharter.html | core | 1440 | pass |  |
| from the app: Coreteamcharter.html | master | 360 | pass |  |
| from the app: Coreteamcharter.html | master | 375 | pass |  |
| from the app: Coreteamcharter.html | master | 412 | pass |  |
| from the app: Coreteamcharter.html | master | 1440 | pass |  |
| from the app: EGBC-HowTo-AV.html | areaAdmin | 360 | pass |  |
| from the app: EGBC-HowTo-AV.html | areaAdmin | 375 | pass |  |
| from the app: EGBC-HowTo-AV.html | areaAdmin | 412 | pass |  |
| from the app: EGBC-HowTo-AV.html | areaAdmin | 1440 | pass |  |
| from the app: EGBC-HowTo-AV.html | core | 360 | pass |  |
| from the app: EGBC-HowTo-AV.html | core | 375 | pass |  |
| from the app: EGBC-HowTo-AV.html | core | 412 | pass |  |
| from the app: EGBC-HowTo-AV.html | core | 1440 | pass |  |
| from the app: EGBC-HowTo-AV.html | master | 360 | pass |  |
| from the app: EGBC-HowTo-AV.html | master | 412 | pass |  |
| from the app: EGBC-HowTo-AV.html | master | 1440 | pass |  |
| from the app: EGBC-HowTo-AV.html | worship | 360 | pass |  |
| from the app: EGBC-HowTo-AV.html | worship | 375 | pass |  |
| from the app: EGBC-HowTo-AV.html | worship | 412 | pass |  |
| from the app: EGBC-HowTo-AV.html | worship | 1440 | pass |  |
| from the app: EGBC-PlayThrough.html | areaAdmin | 1440 | pass |  |
| from the app: EGBC-PlayThrough.html | core | 1440 | pass |  |
| from the app: EGBC-PlayThrough.html | master | 1440 | pass |  |
| from the app: EGBC-PlayThrough.html | worship | 1440 | pass |  |
| from the app: EGBC-Training-Worship.html | areaAdmin | 1440 | pass |  |
| from the app: EGBC-Training-Worship.html | core | 1440 | pass |  |
| from the app: EGBC-Training-Worship.html | master | 1440 | pass |  |
| from the app: EGBC-Training-Worship.html | worship | 1440 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | areaAdmin | 360 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | areaAdmin | 375 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | areaAdmin | 412 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | areaAdmin | 1440 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | core | 360 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | core | 375 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | core | 412 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | core | 1440 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | master | 360 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | master | 412 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | master | 1440 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | worship | 360 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | worship | 375 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | worship | 412 | pass |  |
| from the app: EGBC-Troubleshoot-AV.html | worship | 1440 | pass |  |
| from the app: EmailBuilder2.html | master | 360 | pass |  |
| from the app: EmailBuilder2.html | master | 375 | pass |  |
| from the app: EmailBuilder2.html | master | 412 | pass |  |
| from the app: EmailBuilder2.html | master | 1440 | pass |  |
| from the app: groups.html | areaAdmin | 1440 | pass |  |
| from the app: groups.html | core | 1440 | pass |  |
| from the app: groups.html | everyone | 1440 | pass |  |
| from the app: groups.html | kids | 1440 | pass |  |
| from the app: groups.html | master | 1440 | pass |  |
| from the app: groups.html | worship | 1440 | pass |  |
| from the app: index.html | areaAdmin | 360 | pass |  |
| from the app: index.html | areaAdmin | 375 | pass |  |
| from the app: index.html | areaAdmin | 412 | pass |  |
| from the app: index.html | areaAdmin | 1440 | pass |  |
| from the app: index.html | core | 360 | pass |  |
| from the app: index.html | core | 375 | pass |  |
| from the app: index.html | core | 412 | pass |  |
| from the app: index.html | core | 1440 | pass |  |
| from the app: index.html | everyone | 360 | pass |  |
| from the app: index.html | everyone | 375 | pass |  |
| from the app: index.html | everyone | 412 | pass |  |
| from the app: index.html | everyone | 1440 | pass |  |
| from the app: index.html | kids | 360 | pass |  |
| from the app: index.html | kids | 375 | pass |  |
| from the app: index.html | kids | 412 | pass |  |
| from the app: index.html | kids | 1440 | pass |  |
| from the app: index.html | master | 360 | pass |  |
| from the app: index.html | master | 375 | pass |  |
| from the app: index.html | master | 412 | pass |  |
| from the app: index.html | master | 1440 | pass |  |
| from the app: index.html | worship | 360 | pass |  |
| from the app: index.html | worship | 375 | pass |  |
| from the app: index.html | worship | 412 | pass |  |
| from the app: index.html | worship | 1440 | pass |  |
| from the app: kids-admin.html | kids | 360 | pass |  |
| from the app: kids-admin.html | kids | 375 | pass |  |
| from the app: kids-admin.html | kids | 412 | pass |  |
| from the app: kids-admin.html | kids | 1440 | pass |  |
| from the app: kids-checkin.html | kids | 360 | pass |  |
| from the app: kids-checkin.html | kids | 375 | pass |  |
| from the app: kids-checkin.html | kids | 412 | pass |  |
| from the app: kids-checkin.html | kids | 1440 | pass |  |
| from the app: Library.html | areaAdmin | 360 | pass |  |
| from the app: Library.html | areaAdmin | 375 | pass |  |
| from the app: Library.html | areaAdmin | 412 | pass |  |
| from the app: Library.html | areaAdmin | 1440 | pass |  |
| from the app: Library.html | core | 360 | pass |  |
| from the app: Library.html | core | 375 | pass |  |
| from the app: Library.html | core | 412 | pass |  |
| from the app: Library.html | core | 1440 | pass |  |
| from the app: Library.html | master | 360 | pass |  |
| from the app: Library.html | master | 375 | pass |  |
| from the app: Library.html | master | 412 | pass |  |
| from the app: Library.html | master | 1440 | pass |  |
| from the app: Library.html | worship | 360 | pass |  |
| from the app: Library.html | worship | 375 | pass |  |
| from the app: Library.html | worship | 412 | pass |  |
| from the app: Library.html | worship | 1440 | pass |  |
| from the app: meeting.html | areaAdmin | 360 | pass |  |
| from the app: meeting.html | areaAdmin | 375 | pass |  |
| from the app: meeting.html | areaAdmin | 412 | pass |  |
| from the app: meeting.html | areaAdmin | 1440 | pass |  |
| from the app: meeting.html | core | 360 | pass |  |
| from the app: meeting.html | core | 375 | pass |  |
| from the app: meeting.html | core | 412 | pass |  |
| from the app: meeting.html | core | 1440 | pass |  |
| from the app: meeting.html | master | 360 | pass |  |
| from the app: meeting.html | master | 375 | pass |  |
| from the app: meeting.html | master | 412 | pass |  |
| from the app: meeting.html | master | 1440 | pass |  |
| from the app: meeting.html | worship | 360 | pass |  |
| from the app: meeting.html | worship | 375 | pass |  |
| from the app: meeting.html | worship | 412 | pass |  |
| from the app: meeting.html | worship | 1440 | pass |  |
| from the app: my-messages.html | areaAdmin | 360 | pass |  |
| from the app: my-messages.html | areaAdmin | 375 | pass |  |
| from the app: my-messages.html | areaAdmin | 412 | pass |  |
| from the app: my-messages.html | areaAdmin | 1440 | pass |  |
| from the app: my-messages.html | core | 360 | pass |  |
| from the app: my-messages.html | core | 375 | pass |  |
| from the app: my-messages.html | core | 412 | pass |  |
| from the app: my-messages.html | core | 1440 | pass |  |
| from the app: my-messages.html | everyone | 360 | pass |  |
| from the app: my-messages.html | everyone | 375 | pass |  |
| from the app: my-messages.html | everyone | 412 | pass |  |
| from the app: my-messages.html | everyone | 1440 | pass |  |
| from the app: my-messages.html | kids | 360 | pass |  |
| from the app: my-messages.html | kids | 375 | pass |  |
| from the app: my-messages.html | kids | 412 | pass |  |
| from the app: my-messages.html | kids | 1440 | pass |  |
| from the app: my-messages.html | master | 360 | pass |  |
| from the app: my-messages.html | master | 375 | pass |  |
| from the app: my-messages.html | master | 412 | pass |  |
| from the app: my-messages.html | master | 1440 | pass |  |
| from the app: my-messages.html | worship | 360 | pass |  |
| from the app: my-messages.html | worship | 375 | pass |  |
| from the app: my-messages.html | worship | 412 | pass |  |
| from the app: my-messages.html | worship | 1440 | pass |  |
| from the app: notifications.html | areaAdmin | 360 | pass |  |
| from the app: notifications.html | areaAdmin | 375 | pass |  |
| from the app: notifications.html | areaAdmin | 412 | pass |  |
| from the app: notifications.html | areaAdmin | 1440 | pass |  |
| from the app: notifications.html | core | 360 | pass |  |
| from the app: notifications.html | core | 375 | pass |  |
| from the app: notifications.html | core | 412 | pass |  |
| from the app: notifications.html | core | 1440 | pass |  |
| from the app: notifications.html | everyone | 360 | pass |  |
| from the app: notifications.html | everyone | 375 | pass |  |
| from the app: notifications.html | everyone | 412 | pass |  |
| from the app: notifications.html | everyone | 1440 | pass |  |
| from the app: notifications.html | kids | 360 | pass |  |
| from the app: notifications.html | kids | 375 | pass |  |
| from the app: notifications.html | kids | 412 | pass |  |
| from the app: notifications.html | kids | 1440 | pass |  |
| from the app: notifications.html | master | 360 | pass |  |
| from the app: notifications.html | master | 375 | pass |  |
| from the app: notifications.html | master | 412 | pass |  |
| from the app: notifications.html | master | 1440 | pass |  |
| from the app: notifications.html | worship | 360 | pass |  |
| from the app: notifications.html | worship | 375 | pass |  |
| from the app: notifications.html | worship | 412 | pass |  |
| from the app: notifications.html | worship | 1440 | pass |  |
| from the app: resources.html | areaAdmin | 360 | pass |  |
| from the app: resources.html | areaAdmin | 375 | pass |  |
| from the app: resources.html | areaAdmin | 412 | pass |  |
| from the app: resources.html | areaAdmin | 1440 | pass |  |
| from the app: resources.html | core | 360 | pass |  |
| from the app: resources.html | core | 375 | pass |  |
| from the app: resources.html | core | 412 | pass |  |
| from the app: resources.html | core | 1440 | pass |  |
| from the app: resources.html | kids | 360 | pass |  |
| from the app: resources.html | kids | 375 | pass |  |
| from the app: resources.html | kids | 412 | pass |  |
| from the app: resources.html | kids | 1440 | pass |  |
| from the app: resources.html | master | 360 | pass |  |
| from the app: resources.html | master | 375 | pass |  |
| from the app: resources.html | master | 412 | pass |  |
| from the app: resources.html | master | 1440 | pass |  |
| from the app: resources.html | worship | 360 | pass |  |
| from the app: resources.html | worship | 375 | pass |  |
| from the app: resources.html | worship | 412 | pass |  |
| from the app: resources.html | worship | 1440 | pass |  |
| from the app: safeguarding.html | kids | 360 | pass |  |
| from the app: safeguarding.html | kids | 412 | pass |  |
| from the app: safeguarding.html | kids | 1440 | pass |  |
| from the app: song-summary.html?date=2026-10-25 | worship | 360 | pass |  |
| from the app: song-summary.html?date=2026-10-25 | worship | 375 | pass |  |
| from the app: song-summary.html?date=2026-10-25 | worship | 412 | pass |  |
| from the app: song-summary.html?date=2026-10-25 | worship | 1440 | pass |  |
| from the app: view-only-rota.html | areaAdmin | 360 | pass |  |
| from the app: view-only-rota.html | areaAdmin | 375 | pass |  |
| from the app: view-only-rota.html | areaAdmin | 412 | pass |  |
| from the app: view-only-rota.html | areaAdmin | 1440 | pass |  |
| from the app: view-only-rota.html | core | 360 | pass |  |
| from the app: view-only-rota.html | core | 375 | pass |  |
| from the app: view-only-rota.html | core | 412 | pass |  |
| from the app: view-only-rota.html | core | 1440 | pass |  |
| from the app: view-only-rota.html | kids | 360 | pass |  |
| from the app: view-only-rota.html | kids | 375 | pass |  |
| from the app: view-only-rota.html | kids | 412 | pass |  |
| from the app: view-only-rota.html | kids | 1440 | pass |  |
| from the app: view-only-rota.html | master | 360 | pass |  |
| from the app: view-only-rota.html | master | 375 | pass |  |
| from the app: view-only-rota.html | master | 412 | pass |  |
| from the app: view-only-rota.html | master | 1440 | pass |  |
| from the app: view-only-rota.html | worship | 360 | pass |  |
| from the app: view-only-rota.html | worship | 375 | pass |  |
| from the app: view-only-rota.html | worship | 412 | pass |  |
| from the app: view-only-rota.html | worship | 1440 | pass |  |
| from the app: Worshipteamcharter.html | areaAdmin | 360 | pass |  |
| from the app: Worshipteamcharter.html | areaAdmin | 375 | pass |  |
| from the app: Worshipteamcharter.html | areaAdmin | 412 | pass |  |
| from the app: Worshipteamcharter.html | areaAdmin | 1440 | pass |  |
| from the app: Worshipteamcharter.html | core | 360 | pass |  |
| from the app: Worshipteamcharter.html | core | 375 | pass |  |
| from the app: Worshipteamcharter.html | core | 412 | pass |  |
| from the app: Worshipteamcharter.html | core | 1440 | pass |  |
| from the app: Worshipteamcharter.html | master | 360 | pass |  |
| from the app: Worshipteamcharter.html | master | 375 | pass |  |
| from the app: Worshipteamcharter.html | master | 412 | pass |  |
| from the app: Worshipteamcharter.html | master | 1440 | pass |  |
| from the app: Worshipteamcharter.html | worship | 360 | pass |  |
| from the app: Worshipteamcharter.html | worship | 375 | pass |  |
| from the app: Worshipteamcharter.html | worship | 412 | pass |  |
| from the app: Worshipteamcharter.html | worship | 1440 | pass |  |
| giftaid.html | areaAdmin | 360 | pass |  |
| giftaid.html | areaAdmin | 375 | pass |  |
| giftaid.html | areaAdmin | 412 | pass |  |
| giftaid.html | areaAdmin | 1440 | pass |  |
| giftaid.html | core | 360 | pass |  |
| giftaid.html | core | 375 | pass |  |
| giftaid.html | core | 412 | pass |  |
| giftaid.html | core | 1440 | pass |  |
| giftaid.html | everyone | 360 | pass |  |
| giftaid.html | everyone | 375 | pass |  |
| giftaid.html | everyone | 412 | pass |  |
| giftaid.html | everyone | 1440 | pass |  |
| giftaid.html | kids | 360 | pass |  |
| giftaid.html | kids | 375 | pass |  |
| giftaid.html | kids | 412 | pass |  |
| giftaid.html | kids | 1440 | pass |  |
| giftaid.html | master | 360 | pass |  |
| giftaid.html | master | 375 | pass |  |
| giftaid.html | master | 412 | pass |  |
| giftaid.html | master | 1440 | pass |  |
| giftaid.html | worship | 360 | pass |  |
| giftaid.html | worship | 375 | pass |  |
| giftaid.html | worship | 412 | pass |  |
| giftaid.html | worship | 1440 | pass |  |
| give.html | areaAdmin | 360 | pass |  |
| give.html | areaAdmin | 375 | pass |  |
| give.html | areaAdmin | 412 | pass |  |
| give.html | areaAdmin | 1440 | pass |  |
| give.html | core | 360 | pass |  |
| give.html | core | 375 | pass |  |
| give.html | core | 412 | pass |  |
| give.html | core | 1440 | pass |  |
| give.html | everyone | 360 | pass |  |
| give.html | everyone | 375 | pass |  |
| give.html | everyone | 412 | pass |  |
| give.html | everyone | 1440 | pass |  |
| give.html | kids | 360 | pass |  |
| give.html | kids | 375 | pass |  |
| give.html | kids | 412 | pass |  |
| give.html | kids | 1440 | pass |  |
| give.html | master | 360 | pass |  |
| give.html | master | 375 | pass |  |
| give.html | master | 412 | pass |  |
| give.html | master | 1440 | pass |  |
| give.html | worship | 360 | pass |  |
| give.html | worship | 375 | pass |  |
| give.html | worship | 412 | pass |  |
| give.html | worship | 1440 | pass |  |
| groups-admin.html | areaAdmin | 360 | pass |  |
| groups-admin.html | areaAdmin | 375 | pass |  |
| groups-admin.html | areaAdmin | 412 | pass |  |
| groups-admin.html | areaAdmin | 1440 | pass |  |
| groups-admin.html | master | 360 | pass |  |
| groups-admin.html | master | 375 | pass |  |
| groups-admin.html | master | 412 | pass |  |
| groups-admin.html | master | 1440 | pass |  |
| groups-admin.html (not in their Menu) | core | 375 | pass |  |
| groups-admin.html (not in their Menu) | everyone | 375 | pass |  |
| groups-admin.html (not in their Menu) | kids | 375 | pass |  |
| groups-admin.html (not in their Menu) | worship | 375 | pass |  |
| headcounts.html | master | 360 | pass |  |
| headcounts.html | master | 375 | pass |  |
| headcounts.html | master | 412 | pass |  |
| headcounts.html | master | 1440 | pass |  |
| headcounts.html (not in their Menu) | core | 375 | pass |  |
| headcounts.html (not in their Menu) | everyone | 375 | pass |  |
| headcounts.html (not in their Menu) | kids | 375 | pass |  |
| headcounts.html (not in their Menu) | worship | 375 | pass |  |
| hire.html | areaAdmin | 360 | pass |  |
| hire.html | areaAdmin | 375 | pass |  |
| hire.html | areaAdmin | 412 | pass |  |
| hire.html | areaAdmin | 1440 | pass |  |
| hire.html | core | 360 | pass |  |
| hire.html | core | 375 | pass |  |
| hire.html | core | 412 | pass |  |
| hire.html | core | 1440 | pass |  |
| hire.html | everyone | 360 | pass |  |
| hire.html | everyone | 375 | pass |  |
| hire.html | everyone | 412 | pass |  |
| hire.html | everyone | 1440 | pass |  |
| hire.html | kids | 360 | pass |  |
| hire.html | kids | 375 | pass |  |
| hire.html | kids | 412 | pass |  |
| hire.html | kids | 1440 | pass |  |
| hire.html | master | 360 | pass |  |
| hire.html | master | 375 | pass |  |
| hire.html | master | 412 | pass |  |
| hire.html | master | 1440 | pass |  |
| hire.html | worship | 360 | pass |  |
| hire.html | worship | 375 | pass |  |
| hire.html | worship | 412 | pass |  |
| hire.html | worship | 1440 | pass |  |
| hub.html | areaAdmin | 360 | pass |  |
| hub.html | areaAdmin | 375 | pass |  |
| hub.html | areaAdmin | 412 | pass |  |
| hub.html | areaAdmin | 1440 | pass |  |
| hub.html | core | 360 | pass |  |
| hub.html | core | 375 | pass |  |
| hub.html | core | 412 | pass |  |
| hub.html | core | 1440 | pass |  |
| hub.html | everyone | 360 | pass |  |
| hub.html | everyone | 375 | pass |  |
| hub.html | everyone | 412 | pass |  |
| hub.html | everyone | 1440 | pass |  |
| hub.html | kids | 360 | pass |  |
| hub.html | kids | 375 | pass |  |
| hub.html | kids | 412 | pass |  |
| hub.html | kids | 1440 | pass |  |
| hub.html | master | 360 | pass |  |
| hub.html | master | 375 | pass |  |
| hub.html | master | 412 | pass |  |
| hub.html | master | 1440 | pass |  |
| hub.html | worship | 360 | pass |  |
| hub.html | worship | 375 | pass |  |
| hub.html | worship | 412 | pass |  |
| hub.html | worship | 1440 | pass |  |
| hubresources.html | areaAdmin | 360 | pass |  |
| hubresources.html | areaAdmin | 375 | pass |  |
| hubresources.html | areaAdmin | 412 | pass |  |
| hubresources.html | areaAdmin | 1440 | pass |  |
| hubresources.html | core | 360 | pass |  |
| hubresources.html | core | 375 | pass |  |
| hubresources.html | core | 412 | pass |  |
| hubresources.html | core | 1440 | pass |  |
| hubresources.html | everyone | 360 | pass |  |
| hubresources.html | everyone | 375 | pass |  |
| hubresources.html | everyone | 412 | pass |  |
| hubresources.html | everyone | 1440 | pass |  |
| hubresources.html | kids | 360 | pass |  |
| hubresources.html | kids | 375 | pass |  |
| hubresources.html | kids | 412 | pass |  |
| hubresources.html | kids | 1440 | pass |  |
| hubresources.html | master | 375 | pass |  |
| hubresources.html | master | 412 | pass |  |
| hubresources.html | master | 1440 | pass |  |
| hubresources.html | worship | 360 | pass |  |
| hubresources.html | worship | 375 | pass |  |
| hubresources.html | worship | 412 | pass |  |
| hubresources.html | worship | 1440 | pass |  |
| index.html | core | 360 | pass |  |
| index.html | core | 375 | pass |  |
| index.html | core | 412 | pass |  |
| index.html | core | 1440 | pass |  |
| index.html | master | 360 | pass |  |
| index.html | master | 375 | pass |  |
| index.html | master | 412 | pass |  |
| index.html | master | 1440 | pass |  |
| inventory-system-2.html | core | 360 | pass |  |
| inventory-system-2.html | core | 375 | pass |  |
| inventory-system-2.html | core | 412 | pass |  |
| inventory-system-2.html | core | 1440 | pass |  |
| inventory-system-2.html | master | 360 | pass |  |
| inventory-system-2.html | master | 375 | pass |  |
| inventory-system-2.html | master | 412 | pass |  |
| inventory-system-2.html | master | 1440 | pass |  |
| inventory-system-2.html (not in their Menu) | areaAdmin | 375 | pass |  |
| inventory-system-2.html (not in their Menu) | kids | 375 | pass |  |
| inventory-system-2.html (not in their Menu) | worship | 375 | pass |  |
| kids-admin.html | kids | 360 | pass |  |
| kids-admin.html | kids | 375 | pass |  |
| kids-admin.html | kids | 412 | pass |  |
| kids-admin.html | kids | 1440 | pass |  |
| kids-admin.html | master | 1440 | pass |  |
| kids-checkin.html | kids | 360 | pass |  |
| kids-checkin.html | kids | 375 | pass |  |
| kids-checkin.html | kids | 412 | pass |  |
| kids-checkin.html | kids | 1440 | pass |  |
| kids-checkin.html | master | 360 | pass |  |
| kids-checkin.html | master | 375 | pass |  |
| kids-checkin.html | master | 412 | pass |  |
| kids-checkin.html | master | 1440 | pass |  |
| Library.html | areaAdmin | 360 | pass |  |
| Library.html | areaAdmin | 375 | pass |  |
| Library.html | areaAdmin | 412 | pass |  |
| Library.html | areaAdmin | 1440 | pass |  |
| Library.html | core | 360 | pass |  |
| Library.html | core | 375 | pass |  |
| Library.html | core | 412 | pass |  |
| Library.html | core | 1440 | pass |  |
| Library.html | master | 360 | pass |  |
| Library.html | master | 375 | pass |  |
| Library.html | master | 412 | pass |  |
| Library.html | master | 1440 | pass |  |
| Library.html | worship | 360 | pass |  |
| Library.html | worship | 375 | pass |  |
| Library.html | worship | 412 | pass |  |
| Library.html | worship | 1440 | pass |  |
| Library.html (not in their Menu) | kids | 375 | pass |  |
| maintenance.html | areaAdmin | 360 | pass |  |
| maintenance.html | areaAdmin | 375 | pass |  |
| maintenance.html | areaAdmin | 412 | pass |  |
| maintenance.html | areaAdmin | 1440 | pass |  |
| maintenance.html | core | 360 | pass |  |
| maintenance.html | core | 375 | pass |  |
| maintenance.html | core | 412 | pass |  |
| maintenance.html | core | 1440 | pass |  |
| maintenance.html | everyone | 360 | pass |  |
| maintenance.html | everyone | 375 | pass |  |
| maintenance.html | everyone | 412 | pass |  |
| maintenance.html | everyone | 1440 | pass |  |
| maintenance.html | kids | 360 | pass |  |
| maintenance.html | kids | 375 | pass |  |
| maintenance.html | kids | 412 | pass |  |
| maintenance.html | kids | 1440 | pass |  |
| maintenance.html | master | 360 | pass |  |
| maintenance.html | master | 375 | pass |  |
| maintenance.html | master | 412 | pass |  |
| maintenance.html | master | 1440 | pass |  |
| maintenance.html | worship | 360 | pass |  |
| maintenance.html | worship | 375 | pass |  |
| maintenance.html | worship | 412 | pass |  |
| maintenance.html | worship | 1440 | pass |  |
| meeting.html | areaAdmin | 360 | pass |  |
| meeting.html | areaAdmin | 375 | pass |  |
| meeting.html | areaAdmin | 412 | pass |  |
| meeting.html | areaAdmin | 1440 | pass |  |
| meeting.html | core | 360 | pass |  |
| meeting.html | core | 375 | pass |  |
| meeting.html | core | 412 | pass |  |
| meeting.html | core | 1440 | pass |  |
| meeting.html | everyone | 360 | pass |  |
| meeting.html | everyone | 375 | pass |  |
| meeting.html | everyone | 412 | pass |  |
| meeting.html | everyone | 1440 | pass |  |
| meeting.html | kids | 360 | pass |  |
| meeting.html | kids | 375 | pass |  |
| meeting.html | kids | 412 | pass |  |
| meeting.html | kids | 1440 | pass |  |
| meeting.html | master | 360 | pass |  |
| meeting.html | master | 375 | pass |  |
| meeting.html | master | 412 | pass |  |
| meeting.html | master | 1440 | pass |  |
| meeting.html | worship | 360 | pass |  |
| meeting.html | worship | 375 | pass |  |
| meeting.html | worship | 412 | pass |  |
| meeting.html | worship | 1440 | pass |  |
| MonitorStageMap.html | areaAdmin | 360 | pass |  |
| MonitorStageMap.html | areaAdmin | 375 | pass |  |
| MonitorStageMap.html | areaAdmin | 412 | pass |  |
| MonitorStageMap.html | areaAdmin | 1440 | pass |  |
| MonitorStageMap.html | core | 360 | pass |  |
| MonitorStageMap.html | core | 375 | pass |  |
| MonitorStageMap.html | core | 412 | pass |  |
| MonitorStageMap.html | core | 1440 | pass |  |
| MonitorStageMap.html | master | 360 | pass |  |
| MonitorStageMap.html | master | 375 | pass |  |
| MonitorStageMap.html | master | 412 | pass |  |
| MonitorStageMap.html | master | 1440 | pass |  |
| MonitorStageMap.html | worship | 360 | pass |  |
| MonitorStageMap.html | worship | 375 | pass |  |
| MonitorStageMap.html | worship | 412 | pass |  |
| MonitorStageMap.html | worship | 1440 | pass |  |
| MonitorStageMap.html (not in their Menu) | everyone | 375 | pass |  |
| MonitorStageMap.html (not in their Menu) | kids | 375 | pass |  |
| music-uploader.html | core | 360 | pass |  |
| music-uploader.html | core | 375 | pass |  |
| music-uploader.html | core | 412 | pass |  |
| music-uploader.html | core | 1440 | pass |  |
| music-uploader.html | master | 360 | pass |  |
| music-uploader.html | master | 375 | pass |  |
| music-uploader.html | master | 412 | pass |  |
| music-uploader.html | master | 1440 | pass |  |
| music-uploader.html (not in their Menu) | everyone | 375 | pass |  |
| music-uploader.html (not in their Menu) | kids | 375 | pass |  |
| music-uploader.html (not in their Menu) | worship | 375 | pass |  |
| notifications.html | areaAdmin | 360 | pass |  |
| notifications.html | areaAdmin | 375 | pass |  |
| notifications.html | areaAdmin | 412 | pass |  |
| notifications.html | areaAdmin | 1440 | pass |  |
| notifications.html | core | 360 | pass |  |
| notifications.html | core | 375 | pass |  |
| notifications.html | core | 412 | pass |  |
| notifications.html | core | 1440 | pass |  |
| notifications.html | everyone | 360 | pass |  |
| notifications.html | everyone | 375 | pass |  |
| notifications.html | everyone | 412 | pass |  |
| notifications.html | everyone | 1440 | pass |  |
| notifications.html | kids | 360 | pass |  |
| notifications.html | kids | 375 | pass |  |
| notifications.html | kids | 412 | pass |  |
| notifications.html | kids | 1440 | pass |  |
| notifications.html | master | 360 | pass |  |
| notifications.html | master | 375 | pass |  |
| notifications.html | master | 412 | pass |  |
| notifications.html | master | 1440 | pass |  |
| notifications.html | worship | 360 | pass |  |
| notifications.html | worship | 375 | pass |  |
| notifications.html | worship | 412 | pass |  |
| notifications.html | worship | 1440 | pass |  |
| payments.html | master | 360 | pass |  |
| payments.html | master | 412 | pass |  |
| payments.html | master | 1440 | pass |  |
| payments.html (not in their Menu) | areaAdmin | 375 | pass |  |
| payments.html (not in their Menu) | core | 375 | pass |  |
| payments.html (not in their Menu) | everyone | 375 | pass |  |
| payments.html (not in their Menu) | kids | 375 | pass |  |
| payments.html (not in their Menu) | worship | 375 | pass |  |
| picture-library.html | master | 360 | pass |  |
| picture-library.html | master | 375 | pass |  |
| picture-library.html | master | 412 | pass |  |
| picture-library.html | master | 1440 | pass |  |
| picture-library.html (not in their Menu) | core | 375 | pass |  |
| picture-library.html (not in their Menu) | everyone | 375 | pass |  |
| picture-library.html (not in their Menu) | kids | 375 | pass |  |
| picture-library.html (not in their Menu) | worship | 375 | pass |  |
| places-admin.html | master | 1440 | pass |  |
| places-admin.html (not in their Menu) | core | 375 | pass |  |
| places-admin.html (not in their Menu) | everyone | 375 | pass |  |
| places-admin.html (not in their Menu) | kids | 375 | pass |  |
| places-admin.html (not in their Menu) | worship | 375 | pass |  |
| Planner.html | core | 360 | pass |  |
| Planner.html | core | 375 | pass |  |
| Planner.html | core | 412 | pass |  |
| Planner.html | core | 1440 | pass |  |
| Planner.html | master | 360 | pass |  |
| Planner.html | master | 375 | pass |  |
| Planner.html | master | 412 | pass |  |
| Planner.html | master | 1440 | pass |  |
| Planner.html (not in their Menu) | everyone | 375 | pass |  |
| Planner.html (not in their Menu) | kids | 375 | pass |  |
| Planner.html (not in their Menu) | worship | 375 | pass |  |
| prayer.html | areaAdmin | 1440 | pass |  |
| prayer.html | core | 1440 | pass |  |
| prayer.html | everyone | 1440 | pass |  |
| prayer.html | kids | 1440 | pass |  |
| prayer.html | master | 1440 | pass |  |
| prayer.html | worship | 1440 | pass |  |
| preaching-plan.html | areaAdmin | 360 | pass |  |
| preaching-plan.html | areaAdmin | 375 | pass |  |
| preaching-plan.html | areaAdmin | 412 | pass |  |
| preaching-plan.html | areaAdmin | 1440 | pass |  |
| preaching-plan.html | core | 360 | pass |  |
| preaching-plan.html | core | 375 | pass |  |
| preaching-plan.html | core | 412 | pass |  |
| preaching-plan.html | core | 1440 | pass |  |
| preaching-plan.html | kids | 360 | pass |  |
| preaching-plan.html | kids | 375 | pass |  |
| preaching-plan.html | kids | 412 | pass |  |
| preaching-plan.html | kids | 1440 | pass |  |
| preaching-plan.html | master | 360 | pass |  |
| preaching-plan.html | master | 375 | pass |  |
| preaching-plan.html | master | 412 | pass |  |
| preaching-plan.html | master | 1440 | pass |  |
| preaching-plan.html | worship | 360 | pass |  |
| preaching-plan.html | worship | 375 | pass |  |
| preaching-plan.html | worship | 412 | pass |  |
| preaching-plan.html | worship | 1440 | pass |  |
| preaching-plan.html (not in their Menu) | everyone | 375 | pass |  |
| resources.html | areaAdmin | 360 | pass |  |
| resources.html | areaAdmin | 375 | pass |  |
| resources.html | areaAdmin | 412 | pass |  |
| resources.html | areaAdmin | 1440 | pass |  |
| resources.html | core | 360 | pass |  |
| resources.html | core | 375 | pass |  |
| resources.html | core | 412 | pass |  |
| resources.html | core | 1440 | pass |  |
| resources.html | kids | 360 | pass |  |
| resources.html | kids | 375 | pass |  |
| resources.html | kids | 412 | pass |  |
| resources.html | kids | 1440 | pass |  |
| resources.html | master | 360 | pass |  |
| resources.html | master | 375 | pass |  |
| resources.html | master | 412 | pass |  |
| resources.html | master | 1440 | pass |  |
| resources.html | worship | 360 | pass |  |
| resources.html | worship | 375 | pass |  |
| resources.html | worship | 412 | pass |  |
| resources.html | worship | 1440 | pass |  |
| resources.html (not in their Menu) | everyone | 375 | pass |  |
| retention.html | areaAdmin | 360 | pass |  |
| retention.html | areaAdmin | 375 | pass |  |
| retention.html | areaAdmin | 412 | pass |  |
| retention.html | areaAdmin | 1440 | pass |  |
| retention.html | master | 360 | pass |  |
| retention.html | master | 375 | pass |  |
| retention.html | master | 412 | pass |  |
| retention.html | master | 1440 | pass |  |
| retention.html (not in their Menu) | core | 375 | pass |  |
| retention.html (not in their Menu) | everyone | 375 | pass |  |
| retention.html (not in their Menu) | kids | 375 | pass |  |
| retention.html (not in their Menu) | worship | 375 | pass |  |
| rooms.html | areaAdmin | 360 | pass |  |
| rooms.html | areaAdmin | 375 | pass |  |
| rooms.html | areaAdmin | 412 | pass |  |
| rooms.html | areaAdmin | 1440 | pass |  |
| rooms.html | core | 360 | pass |  |
| rooms.html | core | 375 | pass |  |
| rooms.html | core | 412 | pass |  |
| rooms.html | core | 1440 | pass |  |
| rooms.html | everyone | 360 | pass |  |
| rooms.html | everyone | 375 | pass |  |
| rooms.html | everyone | 412 | pass |  |
| rooms.html | everyone | 1440 | pass |  |
| rooms.html | kids | 360 | pass |  |
| rooms.html | kids | 375 | pass |  |
| rooms.html | kids | 412 | pass |  |
| rooms.html | kids | 1440 | pass |  |
| rooms.html | master | 360 | pass |  |
| rooms.html | master | 375 | pass |  |
| rooms.html | master | 412 | pass |  |
| rooms.html | master | 1440 | pass |  |
| rooms.html | worship | 360 | pass |  |
| rooms.html | worship | 375 | pass |  |
| rooms.html | worship | 412 | pass |  |
| rooms.html | worship | 1440 | pass |  |
| rota-reports.html | areaAdmin | 360 | pass |  |
| rota-reports.html | areaAdmin | 375 | pass |  |
| rota-reports.html | areaAdmin | 412 | pass |  |
| rota-reports.html | areaAdmin | 1440 | pass |  |
| rota-reports.html | master | 360 | pass |  |
| rota-reports.html | master | 375 | pass |  |
| rota-reports.html | master | 412 | pass |  |
| rota-reports.html | master | 1440 | pass |  |
| rota-reports.html (not in their Menu) | core | 375 | pass |  |
| rota-reports.html (not in their Menu) | everyone | 375 | pass |  |
| rota-reports.html (not in their Menu) | kids | 375 | pass |  |
| rota-reports.html (not in their Menu) | worship | 375 | pass |  |
| safeguarding-settings.html | areaAdmin | 360 | pass |  |
| safeguarding-settings.html | areaAdmin | 375 | pass |  |
| safeguarding-settings.html | areaAdmin | 1440 | pass |  |
| safeguarding-settings.html | master | 360 | pass |  |
| safeguarding-settings.html | master | 375 | pass |  |
| safeguarding-settings.html | master | 1440 | pass |  |
| safeguarding.html | areaAdmin | 360 | pass |  |
| safeguarding.html | areaAdmin | 375 | pass |  |
| safeguarding.html | areaAdmin | 412 | pass |  |
| safeguarding.html | areaAdmin | 1440 | pass |  |
| safeguarding.html | master | 360 | pass |  |
| safeguarding.html | master | 412 | pass |  |
| safeguarding.html | master | 1440 | pass |  |
| schematic.html | areaAdmin | 360 | pass |  |
| schematic.html | areaAdmin | 375 | pass |  |
| schematic.html | areaAdmin | 412 | pass |  |
| schematic.html | areaAdmin | 1440 | pass |  |
| schematic.html | core | 360 | pass |  |
| schematic.html | core | 375 | pass |  |
| schematic.html | core | 412 | pass |  |
| schematic.html | core | 1440 | pass |  |
| schematic.html | master | 360 | pass |  |
| schematic.html | master | 375 | pass |  |
| schematic.html | master | 412 | pass |  |
| schematic.html | master | 1440 | pass |  |
| schematic.html | worship | 360 | pass |  |
| schematic.html | worship | 375 | pass |  |
| schematic.html | worship | 412 | pass |  |
| schematic.html | worship | 1440 | pass |  |
| schematic.html (not in their Menu) | kids | 375 | pass |  |
| sermons-admin.html | master | 360 | pass |  |
| sermons-admin.html | master | 375 | pass |  |
| sermons-admin.html | master | 412 | pass |  |
| sermons-admin.html | master | 1440 | pass |  |
| stickynotes.html | areaAdmin | 360 | pass |  |
| stickynotes.html | areaAdmin | 375 | pass |  |
| stickynotes.html | areaAdmin | 412 | pass |  |
| stickynotes.html | areaAdmin | 1440 | pass |  |
| stickynotes.html | core | 360 | pass |  |
| stickynotes.html | core | 375 | pass |  |
| stickynotes.html | core | 412 | pass |  |
| stickynotes.html | core | 1440 | pass |  |
| stickynotes.html | kids | 360 | pass |  |
| stickynotes.html | kids | 375 | pass |  |
| stickynotes.html | kids | 412 | pass |  |
| stickynotes.html | kids | 1440 | pass |  |
| stickynotes.html | master | 360 | pass |  |
| stickynotes.html | master | 375 | pass |  |
| stickynotes.html | master | 412 | pass |  |
| stickynotes.html | master | 1440 | pass |  |
| stickynotes.html | worship | 360 | pass |  |
| stickynotes.html | worship | 375 | pass |  |
| stickynotes.html | worship | 412 | pass |  |
| stickynotes.html | worship | 1440 | pass |  |
| stickynotes.html (not in their Menu) | everyone | 375 | pass |  |
| SundayServicePlanner.html | core | 1440 | pass |  |
| SundayServicePlanner.html | master | 1440 | pass |  |
| SundayServicePlanner.html (not in their Menu) | everyone | 375 | pass |  |
| SundayServicePlanner.html (not in their Menu) | kids | 375 | pass |  |
| SundayServicePlanner.html (not in their Menu) | worship | 375 | pass |  |
| team-mail.html | master | 360 | pass |  |
| team-mail.html | master | 412 | pass |  |
| team-mail.html | master | 1440 | pass |  |
| team-mail.html (not in their Menu) | areaAdmin | 375 | pass |  |
| team-mail.html (not in their Menu) | core | 375 | pass |  |
| team-mail.html (not in their Menu) | everyone | 375 | pass |  |
| team-mail.html (not in their Menu) | kids | 375 | pass |  |
| team-mail.html (not in their Menu) | worship | 375 | pass |  |
| teams-admin.html | master | 360 | pass |  |
| teams-admin.html | master | 375 | pass |  |
| teams-admin.html | master | 412 | pass |  |
| teams-admin.html | master | 1440 | pass |  |
| teams-admin.html (not in their Menu) | areaAdmin | 375 | pass |  |
| teams-admin.html (not in their Menu) | core | 375 | pass |  |
| teams-admin.html (not in their Menu) | everyone | 375 | pass |  |
| teams-admin.html (not in their Menu) | kids | 375 | pass |  |
| teams-admin.html (not in their Menu) | worship | 375 | pass |  |
| videos.html | areaAdmin | 360 | pass |  |
| videos.html | areaAdmin | 375 | pass |  |
| videos.html | areaAdmin | 412 | pass |  |
| videos.html | areaAdmin | 1440 | pass |  |
| videos.html | core | 360 | pass |  |
| videos.html | core | 375 | pass |  |
| videos.html | core | 412 | pass |  |
| videos.html | core | 1440 | pass |  |
| videos.html | kids | 360 | pass |  |
| videos.html | kids | 375 | pass |  |
| videos.html | kids | 412 | pass |  |
| videos.html | kids | 1440 | pass |  |
| videos.html | master | 360 | pass |  |
| videos.html | master | 375 | pass |  |
| videos.html | master | 412 | pass |  |
| videos.html | master | 1440 | pass |  |
| videos.html | worship | 360 | pass |  |
| videos.html | worship | 375 | pass |  |
| videos.html | worship | 412 | pass |  |
| videos.html | worship | 1440 | pass |  |
| videos.html (not in their Menu) | everyone | 375 | pass |  |
| view-only-rota.html | areaAdmin | 360 | pass |  |
| view-only-rota.html | areaAdmin | 375 | pass |  |
| view-only-rota.html | areaAdmin | 412 | pass |  |
| view-only-rota.html | areaAdmin | 1440 | pass |  |
| view-only-rota.html | core | 360 | pass |  |
| view-only-rota.html | core | 375 | pass |  |
| view-only-rota.html | core | 412 | pass |  |
| view-only-rota.html | core | 1440 | pass |  |
| view-only-rota.html | kids | 360 | pass |  |
| view-only-rota.html | kids | 375 | pass |  |
| view-only-rota.html | kids | 412 | pass |  |
| view-only-rota.html | kids | 1440 | pass |  |
| view-only-rota.html | master | 360 | pass |  |
| view-only-rota.html | master | 375 | pass |  |
| view-only-rota.html | master | 412 | pass |  |
| view-only-rota.html | master | 1440 | pass |  |
| view-only-rota.html | worship | 360 | pass |  |
| view-only-rota.html | worship | 375 | pass |  |
| view-only-rota.html | worship | 412 | pass |  |
| view-only-rota.html | worship | 1440 | pass |  |
| watch-admin.html | master | 1440 | pass |  |
| watch.html | areaAdmin | 360 | pass |  |
| watch.html | areaAdmin | 375 | pass |  |
| watch.html | areaAdmin | 412 | pass |  |
| watch.html | areaAdmin | 1440 | pass |  |
| watch.html | core | 360 | pass |  |
| watch.html | core | 375 | pass |  |
| watch.html | core | 412 | pass |  |
| watch.html | core | 1440 | pass |  |
| watch.html | everyone | 360 | pass |  |
| watch.html | everyone | 375 | pass |  |
| watch.html | everyone | 412 | pass |  |
| watch.html | everyone | 1440 | pass |  |
| watch.html | kids | 360 | pass |  |
| watch.html | kids | 375 | pass |  |
| watch.html | kids | 412 | pass |  |
| watch.html | kids | 1440 | pass |  |
| watch.html | master | 360 | pass |  |
| watch.html | master | 375 | pass |  |
| watch.html | master | 412 | pass |  |
| watch.html | master | 1440 | pass |  |
| watch.html | worship | 360 | pass |  |
| watch.html | worship | 375 | pass |  |
| watch.html | worship | 412 | pass |  |
| watch.html | worship | 1440 | pass |  |
| whatson.html | areaAdmin | 360 | pass |  |
| whatson.html | areaAdmin | 375 | pass |  |
| whatson.html | areaAdmin | 412 | pass |  |
| whatson.html | areaAdmin | 1440 | pass |  |
| whatson.html | core | 360 | pass |  |
| whatson.html | core | 375 | pass |  |
| whatson.html | core | 412 | pass |  |
| whatson.html | core | 1440 | pass |  |
| whatson.html | everyone | 360 | pass |  |
| whatson.html | everyone | 375 | pass |  |
| whatson.html | everyone | 412 | pass |  |
| whatson.html | everyone | 1440 | pass |  |
| whatson.html | kids | 360 | pass |  |
| whatson.html | kids | 375 | pass |  |
| whatson.html | kids | 412 | pass |  |
| whatson.html | kids | 1440 | pass |  |
| whatson.html | master | 360 | pass |  |
| whatson.html | master | 375 | pass |  |
| whatson.html | master | 412 | pass |  |
| whatson.html | master | 1440 | pass |  |
| whatson.html | worship | 360 | pass |  |
| whatson.html | worship | 375 | pass |  |
| whatson.html | worship | 412 | pass |  |
| whatson.html | worship | 1440 | pass |  |
| Worshipteamcharter.html | areaAdmin | 360 | pass |  |
| Worshipteamcharter.html | areaAdmin | 375 | pass |  |
| Worshipteamcharter.html | areaAdmin | 412 | pass |  |
| Worshipteamcharter.html | areaAdmin | 1440 | pass |  |
| Worshipteamcharter.html | core | 360 | pass |  |
| Worshipteamcharter.html | core | 375 | pass |  |
| Worshipteamcharter.html | core | 412 | pass |  |
| Worshipteamcharter.html | core | 1440 | pass |  |
| Worshipteamcharter.html | master | 360 | pass |  |
| Worshipteamcharter.html | master | 375 | pass |  |
| Worshipteamcharter.html | master | 412 | pass |  |
| Worshipteamcharter.html | master | 1440 | pass |  |
| Worshipteamcharter.html | worship | 360 | pass |  |
| Worshipteamcharter.html | worship | 375 | pass |  |
| Worshipteamcharter.html | worship | 412 | pass |  |
| Worshipteamcharter.html | worship | 1440 | pass |  |
| Worshipteamcharter.html (not in their Menu) | kids | 375 | pass |  |
| Youthcharter.html | master | 360 | pass |  |
| Youthcharter.html | master | 375 | pass |  |
| Youthcharter.html | master | 412 | pass |  |
| Youthcharter.html | master | 1440 | pass |  |
| Youthcharter.html (not in their Menu) | areaAdmin | 375 | pass |  |
| Youthcharter.html (not in their Menu) | core | 375 | pass |  |
| Youthcharter.html (not in their Menu) | kids | 375 | pass |  |
| Youthcharter.html (not in their Menu) | worship | 375 | pass |  |
| youthserviceplanner.html | master | 1440 | pass |  |
| youthserviceplanner.html (not in their Menu) | areaAdmin | 375 | pass |  |
| youthserviceplanner.html (not in their Menu) | core | 375 | pass |  |
| youthserviceplanner.html (not in their Menu) | everyone | 375 | pass |  |
| youthserviceplanner.html (not in their Menu) | kids | 375 | pass |  |
| youthserviceplanner.html (not in their Menu) | worship | 375 | pass |  |

## Not tapped on purpose

- Rota Planner Build the term and send the rotas
- Email Compiler Write and send to a team
- Teams & groups Add, rename, recolour, order and archive team
- Remove reader 1 ×
- Delete Song
- DELETE ALL DATA
- Remove
- Disconnect
- Send
- Archive
- Review & Send
- Deleted events
- Send phone notifications
- Sign out You stay signed in until you do
- Send an email To your team, or to anyone for the office
