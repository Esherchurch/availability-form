# Reads that need a team, for people with a role and no team (5 Nov 2026)

Every read rule in firestore.rules (279) was listed. The 57 that need a team, a team admin or an admin role cover 53 paths, and each has a verdict below. The roles checked are:
- the safeguarding lead and deputy (`sgLeadOf`, `sgLeadOrDeputy`);
- the health and safety lead and the fire safety lead (`raAnyLead`);
- an event's organiser (`runsEventId`);
- a bookings admin (`bookingsAdminOf`);
- trustees, the office and kids leads.

Trustees, the office and kids leads hold their role through a team (the trustee team, the office job's team, an admin of the children's team), so `volunteer()` already covers them. `tests/stage3/role-holders.rules.test.mjs` checks that too.

The verdicts were reached two ways:
- **On the pages:** the Stage 3 audit, as each role holder on no team, records every read the rules refuse on their key pages, even ones the page catches.
- **In the code:** each read was checked against where it is used.

firestore.build.rules and firestore.churches.rules are built from firestore.rules. Nothing is deployed: it all goes live with the rules.

## Fixed

| Path | Who was refused | Now also allowed |
|---|---|---|
| `eventLeaders` | The safeguarding lead and deputy, so no leaders, no Checks, no Exception and no "Sign it off" were shown. **The stopper.** Also an event's organiser, and the building's health and safety lead. An event with no leaders yet was refused instead of empty. | `sgLeadOf(site)` · `runsEventId` · `raAnyLead(site)` · `resource == null` |
| `eventForms` | The lead and deputy: no child's consent or medical flag on the event page. The organiser and the event's leaders. | `runsEventId` · `isEventLeader` · `sgLeadOfEvent` (read only; writing stays an admin's) |
| `safeguardingSettings` | The lead and deputy, so their checklist lost the church's own questions and their pages lost the ratios. | `sgLeadOrDeputy()` |
| `users` | The lead and deputy: naming an event's leaders. | `sgLeadOrDeputy()` |
| `addressBook` (get, list) | The lead and deputy: the register's leaders and collectors. | `sgLeadOrDeputy()` |
| `kidsSettings` | The lead and deputy: the register and the Menu list them all. A query can't prove `kidsLead` site by site. | `sgLeadOrDeputy()` |
| `planGroups` | The lead and deputy: adding the children's and youth groups to the risk register. | `sgLeadOf(site)` |
| `events` (the rota) | The lead and deputy: "From the rota" on an under-18 event. | `sgLeadOrDeputy()` |
| `eventExceptions` | The lead and deputy: the page asked for the whole event's exceptions. | No rule change: the page asks for its own site's, which `sgLeadOf` proves (safeguarding.html). |
| `concerns` (create), `sgLeadSet()` | A church with only a deputy: an adult's concern was refused, though the Youth Hub's reaches the deputy (55d26a8a). | A lead **or** a deputy on the building. The page uses the deputy and emails both. |

**The building agrees.** leadSite (functions/notify.js, 55d26a8a) picks leadSiteId if set, otherwise the first building with a lead, otherwise one with a deputy. refreshCareStatus records it as `safeguardingSettings/defaults.leadSiteId`, which `sgLeadSet` and `sgLeadOrDeputy` read. The rules test checks that a deputy-only building takes a concern, that its deputy reads it, and that they count as lead for the rules.

## Fine (by design, or not a role holder's page)

| Path | Why |
|---|---|
| `devices` | ChurchShow computers: the admins' pairing page. |
| `rotaExceptions`, `availability`, `availabilityRequests`, `rotaSignoff` | The rota's own working: for those on it. |
| `kb_troubleshoot_av`, `kb_howto_av`, `kb_playthrough`, `kb_training_worship`, `teamContent`, `videoSections`, `teamVideos`, `training_portal`, `songs`, `services`, `songSummaries`, `inventory`, `av_schematic`, `schedules`, `portal`, `pageContent`, `sermonLinks`, `egbc-config` | Team material (worship, AV, training, the plan). Those on the plan (`onThePlan`) and young people already have their own way in. |
| `boardSuggestions` | A team's pin board: its team and admins. |
| `youthGrants`, `youthAccess` | Admins, and a young person's own. |
| `emailDrafts` | The office (a team job) and admins. |
| `contacts` | Written by check-in for a walk-in, not read by a role holder's page. |
| `eventChecklists`, `eventNotes`, `eventChanges`, `commsLog` | Already the event's organisers (`runsEventId`) and admins. |
| `checklistTemplates`, `downloadsLog`, `headcounts`, `uploadLinks`, `uploadItems`, `importKeys`, `calEventsDeleted`, `settings/accounts`, `counters` (invoices), `paymentSettings`, `seriesSignups` (list) | Admin and office tools. |
| `eventExceptions` (rule) | Already the lead and deputy (`sgLeadOf`); only the page's query changed. |
| `screenPages`, `kidsGroups`, `kidsTerms` | Already `kidsLead`, which includes the safeguarding lead and deputy. |
| `teamMailSettings/main` | The Pastor's settings: refused is the answer for anyone else (egbc-auth.js). |
| `formRequests`, `sensitiveResponses` (a whole-event query) | Asked first for the whole event, then by site and by form (listForEvent). The first is a master admin's. An organiser who isn't a leader sees no answers, as one on a team doesn't. |
| `addressBook/<a building lead>` for the health and safety and fire leads | assessment.html names the leads "where the address book can be read (the office); otherwise their roles only". |
