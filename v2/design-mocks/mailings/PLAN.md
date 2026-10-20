# One-off emails, templates, members' meetings, and hosting a call

Plan for review (main window, 20 Oct 2026). Nothing in this plan is built yet. The mock-ups are in
this folder:

- templates-375.png and templates-1440.png: the template picker.
- oneoff-editor-375.png: a members' meeting email being written.
- received-375.png: that email as it arrives.
- members-meeting-375.png: the members' meeting page.
- host-375.png: starting a call as the host.

## Who builds what (proposed; it saves two windows doing the same thing)

| Part | Window | Why |
|---|---|---|
| Templates, one-off emails, audiences, "Dear <first name>", sending, web version | **comms** | It's their builder (enews.html, egbc-mailblocks.js) and their sending path (enews-send.js) |
| The members' meeting page (agenda, minutes, how to join; votes later) and its data | **main** | Meetings are main's (meeting.html, the Meetings Menu entry) |
| Paper links in the emails (who may open them) | **comms**, with main's page | The email links to main's page; the per-person link is part of sending |
| Hosting a call: meetingHostToken, "Start as host", Church HQ's Daily rooms | **main** | meeting.html is main's. **First**, as asked: Present needs hosts |
| "Present slides" in a call | **events** (engine) + main (the hook) | Agreed in FINDINGS-events (below) |

## 1. Hosting a call (first)

**What Martin hit.** Our Daily rooms make everyone knock. A host is somebody who joins with an
owner token, and today a token is only ever made by hand in Daily's dashboard. So the person who set
the meeting up knocks with nobody to let them in.

**One Church HQ Daily account for every church** (like Resend):
- **The key** is Church HQ's, kept server-side in Secret Manager as `DAILY_API_KEY`. No church sees
  or touches Daily.
  - **Martin pastes it once, himself.** He types `firebase functions:secrets:set DAILY_API_KEY`
    (from v2/) and pastes the key when asked. Then functions:hub is deployed.
  - Unlike the key box, this works now, before switch-over: the key never touches Firestore.
- **Rooms** are made by the hub, per church: `<churchId>-<room>` (e.g. `egbc-core-team`), never
  shared between churches.
  - `churchSettings/video` lists the church's rooms: key, name, team, and Daily's room name.
  - The room names aren't secret: knowing one only lets you knock.
  - A master admin adds and renames rooms in Church settings.
  - `videoRoomEnsure` makes a room in Daily (private, with knocking) the first time it's needed.
    That is rule 13: nobody has to press a "set up" button.
- **EGBC's egbc.daily.co rooms keep working until they're moved**, through a `legacyBase` setting.
  - **Catch:** a host token for those rooms has to come from the egbc.daily.co account's own key,
    not Church HQ's.
  - **Recommended:** move EGBC to Church HQ rooms straight away. The hub makes `egbc-…` rooms and
    the setting points at them, so only one key is ever needed.
  - The alternative is a second secret for the old account (Martin pastes two keys).
- **meetingHostToken({ room, eventId })**, a callable:
  - Only these get a token: the meeting's organiser (the event's creator), an admin of the room's
    team, or a master admin. Anyone else is refused.
  - Daily is asked for `is_owner: true`, expiring 30 minutes after the meeting ends (at most 4 hours
    from now), in the person's name.
  - The token is returned, never stored, and never logged.
- **meeting.html:** those people see **"Start as host"**, which gets the token and joins as owner,
  so they can let people in and share their screen or PowerPoint. "Join as a guest" stays.
  Everyone else knocks, as now.
- **No hard-coded rooms anywhere.** VIDEO_BASE and VIDEO_ROOMS go from meeting.html,
  egbc-core-meetings.js, hub-app.js, Planner.html, worshiphubapp.html and functions/rota-feed.js.
  Instead, one shared egbc-video.js and a server helper read `churchSettings/video`.
  places-admin.html is the events window's file, so I'll ask them in FINDINGS-events.
- **Checks** (Daily's API is faked on the emulator):
  - The function refuses a member and gives the organiser, the team admin and a master admin a token.
  - As the organiser, "Start as host" joins with the owner token. As a member, they can only knock.
  - **Break:** a function that hands anybody a token turns it red.
  - No `daily.co` room name is left in a page.

## 2. Templates (comms window)

- **Any email starts from a template, and any email can be saved as one.**
- **A template (`emailTemplates/{id}`) keeps:**
  - the blocks in order, with their placeholder wording;
  - the look and colours;
  - the default audience;
  - the subject pattern, e.g. "Agenda for the Church Members' Meeting, {date}";
  - the blocks that must be filled before Send (e.g. "Add the Zoom link"). Send stays greyed out
    until they are.
- **Starters for any church** (generic, editable wording), made the first time the office opens
  Emails (rule 13):
  - Weekly e-news;
  - Church members' meeting (agenda, last minutes, how to join; members only);
  - Ministry update (picture, story, how to pray or get involved);
  - Prayer letter;
  - Event invitation (from a What's on event, with its Sign up button);
  - Thank you / giving update.
  - EGBC's weekly starter is Val's Mailchimp layout (the existing "classic" look).
- **The office** can rename, edit, copy and archive templates, and use "Save as template" on any
  email. "Ours" lists the church's own.
- **Starting from a template fills in what it can:** What's on, this Sunday, and the next members'
  meeting from the meetings page (date, papers, how to join).
- **Mock-ups:** templates-375.png and templates-1440.png. On a computer, the right-hand side shows
  what a template fills in and what it still needs.

## 3. One-off emails (comms window, with main's meeting page)

1. **Audience:**
   - all e-news subscribers;
   - church members (the address book's tick);
   - a team or group;
   - people picked from the address book.

   The server works out the list and never trusts the page. A **members-only** email goes only to
   people with the tick, even if a chosen team includes others. Never under-18s (address book
   isMinor), and never anyone archived or without an email address.
2. **"Dear <first name>"** comes from the address book (a subscriber's own first name), or
   "Dear friend" if there isn't one. Each person's copy is made at send, like the unsubscribe link.
3. **Papers** are uploaded to the hub (Storage, `mailingDocs/<id>/…`), never to a public file store.
   - The email links to the **meeting's page on the hub**: one button, "See the agenda and minutes".
   - Members who have a hub account sign in.
   - **For members without an account** (many have none), each person's email carries their own
     link, which expires 30 days after the meeting. A function checks it and serves the papers.
     No public file address exists.
   - Held until switch-over: before the locked rules are deployed nothing is uploaded live (the
     events window's pattern). The page says so.
4. **The web version of a members-only email** needs signing in, and the person must have the tick.
   Zoom links and passcodes are in a members-only block, which never appears on any public page or
   the public archive.
5. **The same sending path:**
   - Resend through Church HQ, once per person, with Send me a test.
   - **Share to WhatsApp** is offered only when the email has a public web version. A members-only
     email has none, so no share.

## 4. The members' meeting page (main)

- **The page:** `church-meeting.html`, for members (the tick) and the office.
  - The next meeting: date, time, place, and how to join (our call room, or Zoom words kept in a
    members-only document).
  - Its papers (agenda, last minutes, reports), uploaded by the office.
  - Past meetings with their papers.
  - **Votes later**, if the church wants them: yes / no / abstain, one each, members only.
- **The data:** `churchMeetings/{id}` with its papers in Storage. The Zoom details are kept in
  `churchMeetings/{id}/private/join`, which only members can read.
- **In the Menu:** "Members' meetings" under People and messages, for members and the office. Its
  switch is `meetings`.
- **The "Church members' meeting" template** fills in from the next one.

## 5. Present slides (the events window's engine; my hook)

meeting.html gives hosts a "Present slides" button and a panel beside Daily's call. The events
window's Present engine mounts into it: `EGBCPresent.mount(panel, { deck })`. Only hosts see the
button, so this waits for section 1. Written in FINDINGS-events (F-244).

## Order

1. **Martin:** make a Daily account for Church HQ (if there isn't one), then run the one secret
   command above. Then decide: move EGBC's rooms now (recommended), or keep egbc.daily.co with a
   second key.
2. **Main:** hosting a call (section 1), then the members' meeting page (section 4).
3. **Comms:** templates (section 2), then one-off emails (section 3). They can start now, in
   parallel: section 3's meeting button only needs section 4's page address.
4. **Events:** Present, once hosts work.

## Decisions for Martin

1. **The Daily key:** Secret Manager, pasted by you with the command above (recommended; works
   now), or the Church settings key box (held until switch-over, so hosts wouldn't work until then)?
2. **EGBC's rooms:** move them to Church HQ's account now (one key), or keep egbc.daily.co for a
   while (two keys)?
3. **Members without a hub account:** is each person's own expiring link to the papers all right?
   The alternative is that they must make an account first.
4. **Votes on the members' meeting page:** later (recommended), or now?
5. **Members' meetings:** keep using Zoom (its details kept members-only), or our own call room
   with a host?
