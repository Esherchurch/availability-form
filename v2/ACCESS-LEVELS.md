<!-- Written by tests/check-access-levels.mjs --write. Do not edit by hand:
     it is generated from firestore.rules, which is the point of it. -->

# Who can read what

Generated from `firestore.rules`. `node tests/check-access-levels.mjs` checks
the file still says this and fails if it has drifted.

## The four levels (NEXT-BRIEF §21, Martin, 9 October 2026)

| Level | How the data says so | Rule function |
|---|---|---|
| Pending | signed in, no address book record carries their verified address | none - `active()` is false |
| Attender | a record does, not archived, not a child’s record | `isAttender()`, and `active()` |
| Church member | that record also has the office’s **Church member** tick | `isChurchMember()` |
| Team member | that record has teams in `markers` | `onTeam(team)`, and `volunteer()` |

**`active()` changed meaning and kept its name.** It used to mean "on a team
or administering something"; it now means "in the address book". That is
`volunteer()` now, and every rule meant for volunteers was renamed to it in
the same commit, which moved nothing on the day.

## For volunteers only

| Collection | What it is | The rule |
|---|---|---|
| `availability` | who can serve when | `read: if volunteer();` <br>(line 470) |
| `availabilityRequests` | the rota | `read: if volunteer();` <br>(line 570) |
| `rotaSignoff` | the rota | `read: if volunteer();` <br>(line 664) |
| `events` | the rota, and who is serving on it | `read: if volunteer() \|\| churchShow() \|\| youthGranted();` <br>(line 464) |
| `services` | service plans | `read: if volunteer() \|\| churchShow() \|\| youthGranted();` <br>(line 702) |
| `songs` | the song library | `read: if volunteer() \|\| churchShow() \|\| youthGranted();` <br>(line 503) |
| `teamContent` | team panels | `read: if volunteer();` <br>(line 512) |
| `videoSections` | the team video library | `read: if volunteer();` <br>(line 654) |
| `kb_troubleshoot_av` | AV | `read: if volunteer();` <br>(line 489) |
| `kb_howto_av` | AV | `read: if volunteer();` <br>(line 494) |
| `kb_playthrough` | Worship | `read: if volunteer() \|\| (youthGranted() && resource.data.published == true);` <br>(line 682) |
| `kb_training_worship` | Worship | `read: if volunteer() \|\| (youthGranted() && resource.data.published == true);` <br>(line 689) |
| `inventory` | AV | `read: if volunteer();` <br>(line 714) |
| `av_schematic` | AV | `read: if volunteer();` <br>(line 719) |
| `schedules` | AV | `read: if volunteer();` <br>(line 724) |
| `portal` | older shared team content | `read: if volunteer() \|\| (youthGranted() && docId == 'dashboardContent');` <br>(line 735) |
| `pageContent` | older shared team content | `read: if volunteer();` <br>(line 741) |
| `training_portal` | the practice copies - and this one is a WRITE as well | `read, write: if volunteer();` <br>(line 752) |
| `contacts` | hirer and sign-up contacts: name, email, telephone, isMinor | `get, list: if volunteer();` <br>(line 855) |
| `eventChecklists` | the admin's side of an event | `read: if volunteer();` <br>(line 1011) |
| `checklistTemplates` | the admin's side of an event | `read: if volunteer();` <br>(line 1015) |
| `eventLeaders` | who leads an event | `read: if volunteer();` <br>(line 1395) |
| `safeguardingSettings` | safeguarding | `read: if volunteer();` <br>(line 1469) |
| `counters` | invoice numbering | `read: if volunteer();` <br>(line 1913) |
| `kidsSettings` | Kids Church | `read: if volunteer();` <br>(line 2008) |
| `kidsGroups` | Kids Church | `read: if volunteer();` <br>(line 2017) |
| `kidsTerms` | Kids Church term dates | `read: if volunteer();` <br>(line 2152) |
| `screenPages` | paging a parent on the service screen | `read: if (churchShow() && resource.data.siteId == request.auth.token.siteId && resource.data.clearedAt == null) \|\| (volunteer() && resource.data.clearedAt == null) \|\| (active() && resource.data.createdBy == request.auth.uid) \|\| kidsLead(resource.data.siteId);` <br>(line 2201) |

## Open to any Attender

| Collection | What it is | The rule |
|---|---|---|
| `hubPages` | the hub page registry - an Attender needs the hub at all | `read: if active();` <br>(line 363) |
| `news` | church notices, and the "I have read it" button | `read: if active();` <br>(line 553) |
| `resources` | the resource shelf | `read: if active();` <br>(line 671) |
| `sites` | Book a room | `read: if active() \|\| activeRecord();` <br>(line 779) |
| `rooms` | Book a room | `read: if active() \|\| activeRecord();` <br>(line 784) |
| `bookableResources` | Book a room | `read: if active();` <br>(line 796) |
| `venues` | Book a room | `read: if active();` <br>(line 803) |
| `bookingSettings` | Book a room | `read: if active();` <br>(line 813) |
| `menus` | what is on the menu, for a hire enquiry | `read: if active() \|\| activeRecord();` <br>(line 1560) |
| `groupsSettings` | small groups | `read: if active();` <br>(line 2330) |
| `smallGroups` | small groups - this is what resolves F-103 | `read: if (resource.data.get('visibility', 'public') == 'public' && resource.data.get('active', true) == true) \|\| active();` <br>(line 2334) |

## The address book

```
allow get: if isAdmin() || volunteer() || bookIsMine(personId);
allow list: if isAdmin() || volunteer();
```

It was `allow read: if true` until 9 October 2026, for the availability form.
See PRIVACY-OPEN-COLLECTIONS.md.

## The projection PC

`churchShow()` - the claim AND `devices/{uid}.active`, so
Disconnect on the hub takes effect at once rather than when the token expires.
It may read `songs`, `services`, `events`, and write nothing anywhere.
