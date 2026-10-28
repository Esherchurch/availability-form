# Who sees what: the access matrix

Made from the code by `node tools/access-matrix.mjs` on 2026-10-28, signed in as made-up people on the emulator (FINDINGS-churchhq H-16). The Menu counts only where the hub gives the person a way to open it.

**✓** in their Menu, and the page lets them in · **–** not in their Menu · **⚠ in their Menu, but the page refuses them (always a bug)** · **◐ not in their Menu, but the page would let them in** (reached from somewhere else, or a gap)

A page whose guard asks only "anyone signed in" decides inside itself who sees what; this table shows only whether it is offered.

People: **Pending** Pending · **Attender** Attender · **Member** Member · **Kids Ch** Kids · **Kids lead** Kids Lead · **Worship** Worship · **Wor lead** Worship Lead · **Wor admin** Worship Admin · **Kids admin** Kids Admin · **Core admin** Core Admin · **AV** AV · **Wor core** Worship Core · **K&Y core** KY Core · **Office** Office · **Elders** Elder · **Finance** Finance · **Pastoral** Pastoral · **SG lead** Safeguarding Lead · **Bookings** Bookings · **Plan grp** Plan Group Lead · **Event team** Event Team · **Master** Master

## Where the code differs from what was decided

Martin's decisions first; "(reviewer)" marks the reviewer's findings of 27 Oct, which Martin is to confirm.

- **Maintenance (report a repair): every member** (maintenance.html): matches
- **My evacuation plan: every member** (peep.html): matches
- **Hire our rooms: every member** (hire.html): matches
- **Book a room: core teams, team leaders, the office and the bookings admins** (rooms.html): matches
- **Preaching plan: edited by the leadership job (EGBC: Elders) and the pastor/minister role; read-only for whoever may use the Rota planner; nobody else** (preaching-plan.html): matches
- (reviewer) **Safeguarding: the lead and deputy, and master admins** (safeguarding.html): matches
- (reviewer) **Safeguarding settings: the lead and deputy, and master admins** (safeguarding-settings.html): matches
- (reviewer) **Safeguarding risks: the lead and deputy, the trustees (EGBC: Elders), master admins, and group leaders read only (F-304)** (safeguarding-risk.html): matches
- (reviewer) **Availability form: anyone on a team with a rota** (index.html): matches
- (reviewer) **Payments: the money team (EGBC: Finance) and master admins** (payments.html): matches
- (reviewer) **Connect ChurchShow: admins of AV or Worship (an admin of the core team covering them too, H-15), and master admins** (churchshow.html): matches
- (reviewer) **Check-in: core team admins, the event's own team, master admins** (checkin.html): matches
- **Meetings: anybody on or leading a team, whoever may see every meeting, and master admins (each sees only the meetings they are invited to)** (meeting.html): Kids Ch should not, Kids lead should not, Worship should not, Wor lead should not, Wor admin should not, Kids admin should not, Core admin should not, AV should not, Wor core should not, K&Y core should not, Office should not, Elders should not, Finance should not, Pastoral should not, Master should not
- (reviewer) **Your church: master admins** (your-church.html): matches
- **Performance Notes (and the Schematic and Performance apps on Apps and downloads): the Worship and AV teams, their admins, the core teams covering them, master admins** (Performancenotes.html): matches
- (reviewer) **Registers: core team admins, the event's own team, master admins** (attendance.html): matches
- **The pastor/minister role** is the Pastor chosen in Team emails (teamMailSettings/main.pastor), one person, not a team; the table cannot show them because only master admins and the Pastor may read who it is.

## Top of the Menu

| Page | Guard | Pending | Attender | Member | Kids Ch | Kids lead | Worship | Wor lead | Wor admin | Kids admin | Core admin | AV | Wor core | K&Y core | Office | Elders | Finance | Pastoral | SG lead | Bookings | Plan grp | Event team | Master |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Care & support: what has come in <small>(care-inbox.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | ✓ | – | – | – | – |
| Home <small>(hub.html)</small> | no guard | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| What's on <small>(whatson.html)</small> | no guard | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Watch & Listen <small>(watch.html)</small> | anyone signed in | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Give <small>(give.html)</small> | anyone signed in | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Gift Aid <small>(giftaid.html)</small> | anyone signed in | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Care & support <small>(care.html)</small> | no guard | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pastoral visits <small>(pastoral-visits.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Prayer <small>(prayer.html)</small> | anyone signed in | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Notifications <small>(notifications.html)</small> | no guard | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Sundays

| Page | Guard | Pending | Attender | Member | Kids Ch | Kids lead | Worship | Wor lead | Wor admin | Kids admin | Core admin | AV | Wor core | K&Y core | Office | Elders | Finance | Pastoral | SG lead | Bookings | Plan grp | Event team | Master |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Rota <small>(view-only-rota.html)</small> | on any team | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – | ✓ |
| Rota planner <small>(Planner.html)</small> | leaders of Worship Team, Kids Church, Youth Worship, Core Team | – | – | – | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | – | – | – | – | – | – | – | – | ✓ |
| Sunday service plan <small>(SundayServicePlanner.html)</small> | leaders of Worship Team | – | – | – | – | – | – | ✓ | ✓ | – | ✓ | – | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Preaching plan <small>(preaching-plan.html)</small> | anyone signed in | – | – | – | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | – | ✓ | – | – | – | – | – | – | ✓ |
| Session planner <small>(session-planner.html)</small> | anyone signed in | – | – | – | ✓ | ✓ | – | – | – | ✓ | – | – | – | ✓ | – | – | – | – | – | – | ✓ | – | ✓ |
| Present <small>(present.html)</small> | no guard | – | – | – | ✓ | ✓ | – | – | – | ✓ | – | – | – | ✓ | – | – | – | – | – | – | ✓ | – | ✓ |
| How to present <small>(present-guide.html)</small> | no guard | – | – | – | ✓ | ✓ | – | – | – | ✓ | – | – | – | ✓ | – | – | – | – | – | – | ✓ | – | ✓ |
| Rota reports <small>(rota-reports.html)</small> | no guard | – | – | – | – | – | – | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Availability form <small>(index.html)</small> | no guard | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | ✓ |

## People and messages

| Page | Guard | Pending | Attender | Member | Kids Ch | Kids lead | Worship | Wor lead | Wor admin | Kids admin | Core admin | AV | Wor core | K&Y core | Office | Elders | Finance | Pastoral | SG lead | Bookings | Plan grp | Event team | Master |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Address book <small>(addressbook.html)</small> | an admin of any team, or on Church office | – | – | – | – | – | – | – | ✓ | ✓ | ✓ | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| Send an email <small>(EmailBuilder2.html)</small> | an admin of any team, or on Church office | – | – | – | – | – | – | – | ✓ | ✓ | ✓ | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| Team emails <small>(team-mail.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Members’ meetings <small>(church-meeting.html)</small> | anyone signed in | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| E-news <small>(enews.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| Card maker <small>(cardmaker.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| From Canva <small>(canva.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| Meetings <small>(meeting.html)</small> | no guard | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – | ✓ |

## Events and rooms

| Page | Guard | Pending | Attender | Member | Kids Ch | Kids lead | Worship | Wor lead | Wor admin | Kids admin | Core admin | AV | Wor core | K&Y core | Office | Elders | Finance | Pastoral | SG lead | Bookings | Plan grp | Event team | Master |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Events <small>(events-admin.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | – | – | – | ✓ | ✓ |
| Places <small>(places-admin.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | ✓ | – | – | ✓ |
| Room bookings <small>(bookings-admin.html)</small> | anyone signed in | – | – | – | – | – | – | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | ✓ | – | – | ✓ |
| Catering orders <small>(catering.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Check-in <small>(checkin.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | – | – | – | ✓ | ✓ |
| Registers <small>(attendance.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | – | – | – | ✓ | ✓ |
| Headcounts <small>(headcounts.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Picture library <small>(picture-library.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | ✓ | – | – | ✓ |
| Book a room <small>(rooms.html)</small> | team leaders, core teams, the office and bookings admins | – | – | – | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | ✓ | – | – | ✓ |
| Hire our rooms <small>(hire.html)</small> | no guard | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Maintenance <small>(maintenance.html)</small> | anyone signed in | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Building compliance <small>(compliance.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | ✓ | – | – | – | – | – | – | ✓ |
| Health and safety settings <small>(hs-settings.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| The building <small>(building.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| Live risk register <small>(risk.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | ✓ | – | – | – | – | – | – | ✓ |
| Building risk assessments <small>(assessment.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | ✓ | – | – | – | – | – | – | ✓ |
| My evacuation plan <small>(peep.html)</small> | anyone signed in | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Working alone <small>(lone.html)</small> | no guard | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Drivers and vehicles <small>(transport.html)</small> | no guard | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Church admin

| Page | Guard | Pending | Attender | Member | Kids Ch | Kids lead | Worship | Wor lead | Wor admin | Kids admin | Core admin | AV | Wor core | K&Y core | Office | Elders | Finance | Pastoral | SG lead | Bookings | Plan grp | Event team | Master |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Your church <small>(your-church.html)</small> | master admins | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Church settings <small>(church-settings.html)</small> | master admins | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Teams and groups <small>(teams-admin.html)</small> | doing the office job | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| Data records <small>(data-records.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | ✓ | – | – | – | – | – | – | ✓ |
| What we hold about someone <small>(privacy.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Your services <small>(services-settings.html)</small> | doing the office job | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| Permissions <small>(permissions.html)</small> | master admins | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Giving details <small>(giving-details.html)</small> | doing the office job | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| Payments <small>(payments.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | ✓ |
| Safeguarding <small>(safeguarding.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | ✓ |
| Safeguarding risks <small>(safeguarding-risk.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | ✓ | – | ✓ | – | ✓ |
| Safeguarding settings <small>(safeguarding-settings.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | ✓ |
| Due for deletion <small>(retention.html)</small> | an admin of any team | – | – | – | – | – | – | – | ◐ | ◐ | ◐ | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Small groups <small>(groups-admin.html)</small> | anyone signed in | – | – | – | – | – | – | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Forms <small>(forms-admin.html)</small> | an admin of any team | – | – | – | – | – | – | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Emails sent <small>(comms.html)</small> | no guard | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Manage Watch <small>(watch-admin.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Manage sermons <small>(sermons-admin.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Backup <small>(data-tools.html)</small> | on Core Team | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | – | – | – | – | ✓ |

## My teams

| Page | Guard | Pending | Attender | Member | Kids Ch | Kids lead | Worship | Wor lead | Wor admin | Kids admin | Core admin | AV | Wor core | K&Y core | Office | Elders | Finance | Pastoral | SG lead | Bookings | Plan grp | Event team | Master |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Worship & AV <small>(Worshipteamcharter.html)</small> | on Worship Team | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Play-Through <small>(EGBC-PlayThrough.html)</small> | on Worship Team | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Worship Training <small>(EGBC-Training-Worship.html)</small> | on Worship Team | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Music Database <small>(Library.html)</small> | on Worship Team | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Music Uploader <small>(batchupload.html)</small> | leaders of Worship Team | – | – | – | – | – | – | ✓ | ✓ | – | ✓ | – | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| How-To AV <small>(EGBC-HowTo-AV.html)</small> | on AV Team | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| AV Troubleshoot <small>(EGBC-Troubleshoot-AV.html)</small> | on AV Team | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Inventory <small>(inventory-system-2.html)</small> | leaders of AV Team | – | – | – | – | – | – | – | – | – | ✓ | – | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| AV Infrastructure Mapper <small>(schematic.html)</small> | on AV Team | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Monitor Setup <small>(MonitorStageMap.html)</small> | on AV Team | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Performance Notes <small>(Performancenotes.html)</small> | on Worship Team | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Connect ChurchShow <small>(churchshow.html)</small> | on AV Team, Worship Team | – | – | – | – | – | – | – | ✓ | – | ✓ | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Youth <small>(Youthcharter.html)</small> | on Youth Worship, Lazers, ReNu | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | – | ✓ |
| Youth Service Planner <small>(youthserviceplanner.html)</small> | on Youth Worship | – | – | – | – | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | – | ✓ |
| Children's register <small>(kids-admin.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Sunday check-in <small>(kids-checkin.html)</small> | anyone signed in | – | – | – | – | – | – | – | – | ✓ | – | – | – | – | – | – | – | – | – | – | – | – | ✓ |
| Core Team <small>(Coreteamcharter.html)</small> | on Core Team | – | – | – | – | – | – | – | – | – | ✓ | – | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Music Upload <small>(music-uploader.html)</small> | leaders of Worship Team | – | – | – | – | – | – | ◐ | ◐ | – | ✓ | – | ✓ | – | – | – | – | – | – | – | – | – | ✓ |

## Resources

| Page | Guard | Pending | Attender | Member | Kids Ch | Kids lead | Worship | Wor lead | Wor admin | Kids admin | Core admin | AV | Wor core | K&Y core | Office | Elders | Finance | Pastoral | SG lead | Bookings | Plan grp | Event team | Master |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Pin boards <small>(stickynotes.html)</small> | on any team | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ◐ | ◐ | ◐ | – | – | – | – | ✓ |
| Apps and downloads <small>(hubresources.html)</small> | anyone signed in | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Team Resources <small>(resources.html)</small> | no guard | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Team Videos <small>(videos.html)</small> | doing the worship,av job | – | – | – | – | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | – | ✓ |

## The hub's Home cards

| Card | Pending | Attender | Member | Kids Ch | Kids lead | Worship | Wor lead | Wor admin | Kids admin | Core admin | AV | Wor core | K&Y core | Office | Elders | Finance | Pastoral | SG lead | Bookings | Plan grp | Event team | Master |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| charter | – | – | – | – | – | – | – | ✓ | ✓ | – | – | – | – | – | – | – | – | – | – | – | – | – |
| notices | – | – | – | – | – | – | – | ✓ | ✓ | ✓ | – | – | – | ✓ | – | – | – | – | – | – | – | ✓ |
| pinBoard | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – | ✓ |

## The app's spaces (and their tabs)

- **Pending:** Me and my family (Home, What's on, Me)
- **Attender:** Me and my family (Home, What's on, Listen & Watch, Me)
- **Member:** Me and my family (Home, What's on, Listen & Watch, Me)
- **Kids Ch:** Me and my family (Home, What's on, Listen & Watch, Me); Kids Church (Today, Children, Rota, Team)
- **Kids lead:** Me and my family (Home, What's on, Listen & Watch, Me); Kids Church (Today, Children, Rota, Team)
- **Worship:** Me and my family (Home, What's on, Listen & Watch, Me); Worship & AV (Rota, Sunday, Learn, Team)
- **Wor lead:** Me and my family (Home, What's on, Listen & Watch, Me); Worship & AV (Rota, Sunday, Learn, Team)
- **Wor admin:** Me and my family (Home, What's on, Listen & Watch, Me); Worship & AV (Rota, Sunday, Learn, Team)
- **Kids admin:** Me and my family (Home, What's on, Listen & Watch, Me); Kids Church (Today, Children, Rota, Team)
- **Core admin:** Me and my family (Home, What's on, Listen & Watch, Me); Worship & AV (Rota, Sunday, Learn, Team); Core Team (Plan, Rota, Meetings, Team)
- **AV:** Me and my family (Home, What's on, Listen & Watch, Me); Worship & AV (Rota, Sunday, Learn, Team)
- **Wor core:** Me and my family (Home, What's on, Listen & Watch, Me); Worship & AV (Rota, Sunday, Learn, Team); Core Team (Plan, Rota, Meetings, Team)
- **K&Y core:** Me and my family (Home, What's on, Listen & Watch, Me); Kids Church (Today, Children, Rota, Team); Youth (Rota, This Sunday, Team); Lazers (Rota, This Sunday, Team); ReNu (Rota, This Sunday, Team); Kids & Youth Core Team (Plan, Rota, Meetings, Team)
- **Office:** Me and my family (Home, What's on, Listen & Watch, Me); The building (Checks); Running things (People, Bookings, Send)
- **Elders:** Me and my family (Home, What's on, Listen & Watch, Me); The building (Checks)
- **Finance:** Me and my family (Home, What's on, Listen & Watch, Me)
- **Pastoral:** Me and my family (Home, What's on, Listen & Watch, Me)
- **SG lead:** Me and my family (Home, What's on, Listen & Watch, Me)
- **Bookings:** Me and my family (Home, What's on, Listen & Watch, Me); Running things (Bookings)
- **Plan grp:** Me and my family (Home, What's on, Listen & Watch, Me)
- **Event team:** Me and my family (Home, What's on, Listen & Watch, Me)
- **Master:** Me and my family (Home, What's on, Listen & Watch, Me); Worship & AV (Rota, Sunday, Learn, Team); Kids Church (Today, Children, Rota, Team); Youth (Rota, This Sunday, Team); Lazers (Rota, This Sunday, Team); ReNu (Rota, This Sunday, Team); Maintenance (Jobs, Rooms, Team); The building (Checks); Core Team (Plan, Rota, Meetings, Team); Running things (People, Bookings, Send); Kids & Youth Core Team (Plan, Rota, Meetings, Team)
