# Step R — the live rota calendar

Each person gets their own subscribe link. They add it once to Google, Apple or
Outlook, and from then on their rota is in their calendar and stays right when
the rota changes. No new email, nothing to download again.

The `.ics` attachments on the rota emails stay exactly as they are. This is an
addition, not a replacement.

Written 8 October 2026. **Established before anything was built**, which is the
order NEXT-BRIEF §11 asks for.

---

## 1. How the rota is stored

One document per event, in `events/{eventId}`:

| Field | Example | Notes |
|---|---|---|
| `date` | `"2026-10-11"` | a string, not a timestamp |
| `startTime` / `endTime` | `"08:00"` / `"11:30"` | strings; may be absent |
| `type` | `"Sunday Morning Worship"` | |
| `description` | `"Communion"` | may be empty |
| `termLabel` | `"Autumn 2026"` | |
| `teams` | `["Worship Team","AV Team"]` | who the event belongs to |
| `roles` | `["Worship Leader","Keyboard",…]` | the slots this event has |
| `assignments` | `{ "Guitar": {id,name} }` | **see below** |
| `archived` / `draft` | `false` | |
| `videoRoom` | `"worship-core-team"` | optional; absent means use the default for the type |

**`assignments` holds two shapes.** `Planner.html` writes `{id, name}` for a
single person (line 369) and `[{id, name}, …]` for several (line 406). Anything
reading it must handle both, or it will silently miss everybody in a shared
role. The feed uses the same `Array.isArray(raw) ? raw : [raw]` the planner
uses.

**Who is in an event** is already settled, in `Planner.html` line 62,
`isInvitedTo(ev, memberId)`, and it is what the rota emails and today's `.ics`
attachments use:

- anyone whose id appears in any assignment, **or**
- for a **meeting**, everyone in the event's ticked teams — matched on the
  address book's `markers`, with "Youth" on the event matching "Youth Worship"
  on the person.

The feed reproduces that rule rather than inventing a second one. If the rule
changes, both must change together; that is a thing to watch.

**The person's id** is their address book document id. `users/{uid}.memberId`
holds it, mirrored from the address book at sign-in. So the chain is
key → uid → memberId → their slots.

---

## 2. What each person's feed holds

One `VEVENT` per event they are in, from events that are **not archived and not
draft**. Exactly what today's `.ics` attachment holds, and nothing more:

| Line | Content |
|---|---|
| `SUMMARY` | `EGBC: Guitar, Sound` — **their own roles**; for a meeting with no role, `EGBC: Core Team Meeting` |
| `DESCRIPTION` | `Sunday Morning Worship — Communion`, plus `Join the video call: …` where the event has one |
| `DTSTART` / `DTEND` | `TZID=Europe/London`, or an all-day entry where the event has no time |
| `LOCATION`, `URL` | the video call link, where there is one |
| `UID` | `egbc-rota-<eventId>@esherchurch.org` |

**What it does NOT hold**, by decision (§11): no other people's names, no
service leader or speaker, no private notes, no availability, nothing about
anybody else at all. A person's feed is their own slots and nothing else. If
their link ever did get out, what leaks is "somebody is on guitar at 8am on
Sunday" — which is on the wall planner anyway.

**One difference from the email attachment, on purpose.** The attachment's UID
includes the date (`egbc-rota-<id>-<date>@…`). In a one-off file that is fine.
In a *subscription* it is not: move an event from the 11th to the 18th and the
UID changes, so the calendar keeps the old entry and adds a new one, and the
person has two. The feed keys on the event id alone, so a moved event moves.

---

## 3. The private key, and "Reset my calendar link"

The link is `…/rota.ics?k=<32 random characters>`. A calendar app cannot sign
in, so the key is what stands in for signing in. That means it has to be
treated as a password.

**Two documents, and the client writes neither.**

| Document | Holds | Who can read it |
|---|---|---|
| `calendarKeys/{uid}` | `{ key, createdAt }` | that person, and nobody else |
| `calendarFeeds/{key}` | `{ uid, memberId, createdAt }` | **nobody** — only the function, through the Admin SDK |

`calendarFeeds` is the one the function looks a key up in. It is closed to
every client, in rules, so a key cannot be turned back into a person by anyone
but the server.

**Why not keep the key on `users/{uid}`.** Because `users` is readable by any
active member — the rule is `request.auth.uid == uid || active()`, which exists
so the hub can show who is on which team. Firestore rules cannot hide one field
of a document, so a key kept there would be readable by every member of the
church. That is how a private link stops being private.

**Making and resetting the link** is done by the function, not the page, so
that the page never invents a key and never needs write access to the lookup:

1. The page calls `myCalendarLink` (callable, signed in).
2. The function reads `calendarKeys/{uid}`. If there is a key, it returns it.
3. If there is none, or the page asked to reset, it makes a new 32-character
   key from `crypto.randomBytes`, **deletes `calendarFeeds/<old key>`**, writes
   the new pair, and returns the new link.

Deleting the old `calendarFeeds` document is what makes "Reset my calendar
link" mean something: the old URL stops resolving to anybody that moment. The
person's calendar app will keep showing what it last downloaded until they
remove the subscription — no server can reach into their phone — so the page
says that in plain words rather than implying the old entries vanish.

---

## 4. How the Cloud Function is tested on the emulator

`firebase.json` gains a `functions` block with **`codebase: "hub"`** and the
functions emulator on port 5101.

`node tests/check-rota-feed.mjs` runs against `firebase emulators:exec` with
firestore, auth and functions, on synthetic data only, and proves:

- a person's feed holds **their** slots and only theirs
- their roles are on the `SUMMARY`, and **no other person's name appears
  anywhere in the file**
- times come out as `Europe/London`, and an event with no time is all-day
- an archived event and a draft event are not in it
- a meeting the person's team is on **is** in it, with no role
- a wrong key gets **404** and no clue about whether the key ever existed
- after a reset the **old key gets 404** and the new one works
- the body parses as a calendar: `BEGIN:VCALENDAR` … `END:VCALENDAR`, one
  `BEGIN:VEVENT` per expected slot, CRLF line endings, lines folded at 75
  characters

Each with a deliberate break: take out the archived filter and the archived
event appears; take out the person filter and somebody else's name appears;
skip the delete on reset and the old key still works.

---

## 5. Martin's deploy steps, in plain words

**Do not run these yet.** They are here so they are written down; Step R stops
before deploying.

**The one thing that must not be got wrong.** `sendEmail` — the function that
sends the rota emails — lives in the same Google project but belongs to the
other window and is not in this repository. If you deploy with a bare
`firebase deploy --only functions`, the Firebase CLI sees a function in the
project that is not in your folder and **offers to delete it**. Say no if you
are ever asked, but better: never give it the chance.

**Always name the codebase:**

```
firebase deploy --only functions:hub --project egbc-worship-planner
```

Never `firebase deploy --only functions`, and never `firebase deploy` on its
own.

Step by step, from the `v2` folder:

1. **Sign in**, as the church account:
   `firebase login`
   (`esherbaptistsav@gmail.com` — the account with access to the project.)

2. **Install what the function needs**, once:
   `cd functions` then `npm install` then `cd ..`

3. **Deploy, naming the codebase:**
   `firebase deploy --only functions:hub --project egbc-worship-planner`

4. **Say the function may be opened without signing in.** A calendar app cannot
   sign in, so the feed has to be reachable without an account — the key in the
   link is what protects it. The CLI normally sets this for you and says so. If
   the deploy reports that it could not, run:
   `gcloud functions add-invoker-policy-binding rotaFeed --region=europe-west2 --member=allUsers`

5. **Check it, with your own link:** open the hub, go to your profile, copy
   "My calendar link", and paste it into a browser. You should see a file of
   text beginning `BEGIN:VCALENDAR` with your own slots in it and nobody
   else's.

6. **Only then tell anybody.** Once it is right, the link is in the hub for
   everyone, and the wording there explains the three calendar apps.

**If it goes wrong**, nothing on the site breaks: the feed is a separate
address, and nothing on any page depends on it. Delete it with
`firebase functions:delete rotaFeed --region=europe-west2` and the site carries
on exactly as before.

**What this costs.** The function runs when a calendar app asks, which is
roughly every few hours per person. For a team of fifty that is a few thousand
calls a month, inside the free allowance.
