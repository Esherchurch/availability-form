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
| `availability` | who can serve when | `read: if volunteer();` <br>(line 464) |
| `availabilityRequests` | the rota | `read: if volunteer();` <br>(line 549) |
| `rotaSignoff` | the rota | `read: if volunteer();` <br>(line 624) |
| `events` | the rota, and who is serving on it | `read: if volunteer() \|\| churchShow();` <br>(line 458) |
| `services` | service plans | `read: if volunteer() \|\| churchShow();` <br>(line 655) |
| `songs` | the song library | `read: if volunteer() \|\| churchShow();` <br>(line 496) |
| `teamContent` | team panels | `read: if volunteer();` <br>(line 505) |
| `videoSections` | the team video library | `read: if volunteer();` <br>(line 614) |
| `kb_troubleshoot_av` | AV | `read: if volunteer();` <br>(line 483) |
| `kb_howto_av` | AV | `read: if volunteer();` <br>(line 488) |
| `kb_playthrough` | Worship | `read: if volunteer();` <br>(line 639) |
| `kb_training_worship` | Worship | `read: if volunteer();` <br>(line 644) |
| `inventory` | AV | `read: if volunteer();` <br>(line 667) |
| `av_schematic` | AV | `read: if volunteer();` <br>(line 672) |
| `schedules` | AV | `read: if volunteer();` <br>(line 677) |
| `portal` | older shared team content | `read: if volunteer();` <br>(line 686) |
| `pageContent` | older shared team content | `read: if volunteer();` <br>(line 691) |
| `training_portal` | the practice copies - and this one is a WRITE as well | `read, write: if volunteer();` <br>(line 702) |
| `contacts` | hirer and sign-up contacts: name, email, telephone, isMinor | `get, list: if volunteer();` <br>(line 805) |
| `eventChecklists` | the admin's side of an event | `read: if volunteer();` <br>(line 961) |
| `checklistTemplates` | the admin's side of an event | `read: if volunteer();` <br>(line 965) |
| `eventLeaders` | who leads an event | `read: if volunteer();` <br>(line 1345) |
| `safeguardingSettings` | safeguarding | `read: if volunteer();` <br>(line 1419) |
| `counters` | invoice numbering | `read: if volunteer();` <br>(line 1863) |
| `kidsSettings` | Kids Church | `read: if volunteer();` <br>(line 1958) |
| `kidsGroups` | Kids Church | `read: if volunteer();` <br>(line 1967) |
| `kidsTerms` | Kids Church term dates | `read: if volunteer();` <br>(line 2102) |
| `screenPages` | paging a parent on the service screen | `read: if (churchShow() && resource.data.siteId == request.auth.token.siteId && resource.data.clearedAt == null) \|\| (volunteer() && resource.data.clearedAt == null) \|\| (active() && resource.data.createdBy == request.auth.uid) \|\| kidsLead(resource.data.siteId);` <br>(line 2151) |

## Open to any Attender

| Collection | What it is | The rule |
|---|---|---|
| `hubPages` | the hub page registry - an Attender needs the hub at all | `read: if active();` <br>(line 363) |
| `news` | church notices, and the "I have read it" button | `read: if active();` <br>(line 532) |
| `resources` | the resource shelf | `read: if active();` <br>(line 631) |
| `sites` | Book a room | `read: if active() \|\| activeRecord();` <br>(line 729) |
| `rooms` | Book a room | `read: if active() \|\| activeRecord();` <br>(line 734) |
| `bookableResources` | Book a room | `read: if active();` <br>(line 746) |
| `venues` | Book a room | `read: if active();` <br>(line 753) |
| `bookingSettings` | Book a room | `read: if active();` <br>(line 763) |
| `menus` | what is on the menu, for a hire enquiry | `read: if active() \|\| activeRecord();` <br>(line 1510) |
| `groupsSettings` | small groups | `read: if active();` <br>(line 2280) |
| `smallGroups` | small groups - this is what resolves F-103 | `read: if (resource.data.get('visibility', 'public') == 'public' && resource.data.get('active', true) == true) \|\| active();` <br>(line 2284) |

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
