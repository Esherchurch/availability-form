# The server side — deploying it

**All five are live**, deployed to `europe-west2` on 9 October 2026. Martin
checked his own "Just me" feed: 9 slots, refreshing every four hours; an
unknown key gets 404; `myCalendarLink` without signing in gets 401.

**These same steps are how it is redeployed.** Nothing about them changes.

There are **five functions**, and they are all in `v2/functions/`:

| Function | What it is | When it runs |
|---|---|---|
| `rotaFeed` | a person's calendar, as a subscription | whenever a calendar app asks |
| `myCalendarLink` | makes or resets one of their calendar links | when they press a button in the hub |
| `myCalendarLinks` | which links they already have | when they open "My rota" |
| `bookingReminders` | "your room is booked tomorrow" | 09:00 London, every day |
| `documentExpiryReminders` | a hirer's insurance running out | 09:30 London, every day |

---

---

## Before 30 October 2026: Node 22

The deploy warned that **Node.js 20 is decommissioned on 30 October 2026**, and
after that date **nothing in this codebase can be deployed at all** — not a
fix, not a rollback. It is a hard stop on deploying, not on running: what is
already live keeps running.

**That is done.** `functions/package.json` now asks for **Node 22**, with
`firebase-functions` 7 and `firebase-admin` 14 (from 20, 6 and 12). The
Firebase CLI reads the runtime from `engines.node` in that file, so there is
nothing else to change and no flag to remember.

**Redeploy with exactly the same command** as below. The deploy moves the five
functions onto the new runtime in place; their addresses do not change, so
every calendar link anybody has already added keeps working.

Checked on the emulator before being handed over: the rota feed (45), the
calendar end to end through the hub (23) and the reminders (38) all pass on
the new libraries, with every import they use resolving.

**One thing the emulator cannot tell you.** It runs the functions on whatever
Node the machine has — 24 here — and says so: *"Your requested node version 22
doesn't match your global version 24."* So the checks prove the code works on
the new **libraries**, not that it works on Node 22 specifically. Nothing here
uses anything that differs between 22 and 24, but the first true test of the
runtime is the deploy, and the way to see it went well is step 5 onwards.

---

## The one thing that must not be got wrong

**`sendEmail` lives in the same Google project, belongs to the other window,
and is not in this repository.** If you deploy with a bare
`firebase deploy --only functions`, the Firebase CLI sees a function in the
project that is not in your folder and **offers to delete it**. Say no if you
are ever asked — but better, never give it the chance.

**Always name the codebase:**

```
firebase deploy --only functions:hub --project egbc-worship-planner
```

Never `firebase deploy --only functions`, and never `firebase deploy` on its
own.

---

## Step by step, from the `v2` folder

**1. Sign in**, as the church account:

```
firebase login
```

(`esherbaptistsav@gmail.com` — the account with access to the project.)

**2. Install what the functions need.** Do this again whenever the libraries
change — which they just have, for Node 22:

```
cd functions
npm install
cd ..
```

**3. Deploy, naming the codebase:**

```
firebase deploy --only functions:hub --project egbc-worship-planner
```

All five go together. The first deploy of a scheduled function also creates
its timer in Cloud Scheduler, which can take a minute or two after the deploy
itself finishes.

**On the Node 22 redeploy**, watch for two things in what the CLI prints:
- it should say **nodejs22** against each function, not nodejs20
- it should **not** offer to delete anything. If it names `sendEmail`, say no
  and stop — that means the codebase was not named, and the command above is
  the one that names it.

**4. Say the feed may be opened without signing in.** *(Already done on the
first deploy — a redeploy does not undo it. This is here for a fresh project.)* A calendar app cannot
sign in, so `rotaFeed` has to be reachable without an account — the key in the
link is what protects it. The CLI normally sets this and says so. If the
deploy reports that it could not:

```
gcloud functions add-invoker-policy-binding rotaFeed --region=europe-west2 --member=allUsers
```

**Only `rotaFeed`.** The other four must stay closed: `myCalendarLink` and
`myCalendarLinks` answer only the person asking, and the two timers are called
by Google's scheduler, not by anybody.

---

---

## The address book privacy fix, and the access levels (9 October 2026)

**THE ORDER MATTERS MORE THAN ANYTHING ELSE ON THIS PAGE.** The functions go
first and the rules go last, and there is a gap in between where everything
works. Do it the other way round and the availability form — the one page the
whole church uses — stops working the moment the rules land, because the
functions it now asks are not there yet.

Three things change together:

- `addressBook`, `events` and `availability` stop being open to the internet.
  The availability form asks three new functions instead.
- Being **in the address book** now makes somebody an Attender, with a sign-in
  that works. Before, only people on a team could get in at all.
- The projection PC (ChurchShow) gets its own identity in the rules, because
  closing `events` is what would otherwise black out the screens.

### 1. Deploy the functions — safe to do today

```
cd functions
npm install
cd ..
firebase deploy --only functions:hub --project egbc-worship-planner
```

**Nine functions now, not five.** The four new ones:

| | |
|---|---|
| `findMe` | the availability form: who is on this email address |
| `myDates` | their dates, and their previous answers |
| `saveAnswer` | one answer |
| **`whoAmI`** | **which address book record belongs to the person signed in** |

**`whoAmI` is the one that matters most, and it is easy to overlook.** Signing
in has always worked by the page querying the address book to find out who you
are. With the address book shut, a page cannot do that any more — a brand new
account is on no team, so it is allowed nothing — and it cannot be fixed in the
rules. The lookup is this function. **If it is missing when the rules land,
nobody new can sign in at all**, and anybody whose account was linked
automatically rather than by hand stops being recognised on their next visit.

Watch for the same two things as always: **nodejs22** against each, and **no
offer to delete anything** — if it names `sendEmail`, say no and stop, because
the codebase was not named.

Deploying these changes nothing for anybody. The form still reads Firestore
directly until step 4, the pages carry on as they are, and the new functions
simply sit there.

### 2. Tick the Church members — before step 4, not after

Open **Address book**, and against each person who has formally joined the
church, tick **Church member** (it is in the same block as Master admin and
Under 16).

**The tick starts off for everybody.** Until somebody has it, the **CMM**
meeting room is invisible to everyone, including the Core Team — it is no
longer offered in Meetings and a pasted link to it is refused. Nothing else
depends on the tick yet.

### 3. Turn on two clean-up timers — one console setting each

The form keeps two small collections and both carry an `expiresAt`:

| Collection | What it holds | Lives for |
|---|---|---|
| `formSessions` | the token that proves somebody can receive mail at an address | 2 hours |
| `formRateLimit` | a **hash** of a connection, and a count. No address, no name. | 1 hour |

In the Firebase console → Firestore → **Time-to-live**, add a policy on each
of those two collections with the field **`expiresAt`**. Without them nothing
breaks; the two collections simply grow for ever.

### 4. Deploy the rules — AT SWITCH-OVER, NOT BEFORE

```
firebase deploy --only firestore:rules --project egbc-worship-planner
```

**This is the one that cannot be half done.** After it:

- a stranger gets nothing from the address book or the rota
- the availability form works only if step 1 has been done
- **signing in works only if step 1 has been done**, because `whoAmI` is what
  finds somebody's record now
- ChurchShow works only once it has been paired (that is a separate piece of
  work, and it is not finished — until it is, the projection PC loses its
  reads the moment these rules land)

**So do not deploy these rules until ChurchShow has been paired**, or Sunday
morning's screens go blank. That is the one hard dependency between the two
jobs.

### What to check by hand, in this order

1. Open the availability form **in a private window**, signed in to nothing.
   Type in the address of somebody on a rota. You should get their name, their
   Sundays, and any answer they gave last time — **that last part is new**, the
   form could never show it before.
2. Press an answer, reload the page, and go in again. The answer should still
   be there.
3. Sign in as somebody who is **in the address book but on no team**. Before,
   they got "No teams yet" and nothing else. They should now reach the hub.
4. Sign in as yourself and open **Meetings**. CMM should be in the list if you
   have the tick, and absent if you have not.
5. Open the **Youth Service Planner** signed out — it should ask you to sign
   in rather than drawing itself with an empty name list.

### If the form stops working after step 4

The functions were not deployed, or were deployed without the codebase named.
Run step 1 again and watch what the CLI prints. Nothing needs to be rolled
back: the rules and the functions are independent, and the form starts working
again as soon as the functions are there.

### One thing worth knowing about browsers

Somebody whose browser is still holding yesterday's `egbc-auth.js` writes the
old shape of their own account record. The rules accept it on purpose — they
check the two new fields only if they are present — so a stale browser cannot
lock anybody out. It just means that person is treated as they were before
until they next load the page properly. There are rules tests for both shapes.

---

## The projection computer (ChurchShow) — one extra step, and it is easy to miss

Three more functions: `churchShowPairingCode`, `churchShowRedeem` and
`churchShowDisconnect`. **Twelve in all now.** They deploy with the same
command as everything else:

```
firebase deploy --only functions:hub --project egbc-worship-planner
```

### The step that is not a deploy

`churchShowRedeem` signs a **custom token**, and a v2 function cannot do that
until its own runtime service account is allowed to sign tokens for itself.
Without this the function answers an error and ChurchShow shows *"That code
isn't valid or has run out"* for every code, however fresh.

The functions run as the project's **default compute account**, read from the
console on 12 Oct 2026 (Cloud Run → bookingreminders → YAML,
`serviceAccountName`): `199442060489-compute@developer.gserviceaccount.com`.
NOT the appspot account this note used to guess. Then, once:

```
gcloud iam service-accounts add-iam-policy-binding ^
  199442060489-compute@developer.gserviceaccount.com ^
  --member="serviceAccount:199442060489-compute@developer.gserviceaccount.com" ^
  --role="roles/iam.serviceAccountTokenCreator" ^
  --project=egbc-worship-planner
```

It names the same account twice on purpose: it is giving the account
permission to sign for **itself**.

`churchShowRedeem` also has to be reachable without an account, because the
projection computer has none until the code gives it one. The CLI normally
sets that and says so; if the deploy reports it could not:

```
gcloud functions add-invoker-policy-binding churchShowRedeem --region=europe-west2 --member=allUsers
```

**Only `churchShowRedeem` and `rotaFeed`.** The pairing and disconnect
functions check who is asking and must stay closed.

### Connecting it, on the day

1. On the hub, open **Menu → Worship & AV → AV → Connect ChurchShow**. An AV or
   Worship admin, or you.
2. Choose the building and press **Make pairing code**. An eight-character code
   appears with a countdown; it lasts fifteen minutes and works once.
3. On the projection computer: ChurchShow → **Settings** → **Connect to the
   hub**, type the code, press Connect.
4. The hub page's "What is connected" list shows it as **On**.

**Do this before the rules go live**, or the screens read nothing on Sunday.
It is the one hard dependency between the two jobs.

### If a computer goes missing

Press **Disconnect** against that building. The screens there stop reading the
hub **straight away** — not within the hour — because the rules check the
device's own record on every request as well as its sign-in. Any code made and
not yet used is thrown away at the same time. Connect it again with a new code
when the machine is back.

One connection covers a **building**, not a computer, so the spare machine can
pair with its own code without stopping the main one.

---

## Redeeming a youth code (9 October 2026)

**Thirteen functions now.** The new one is `redeemYouthCode`, and it is the
reason a young person's phone no longer reads the document that holds their
**parent's email address**.

It deploys with everything else:

```
firebase deploy --only functions:hub --project egbc-worship-planner
```

**It has to be reachable without an account**, because a young person has
none until the code gives them one. The CLI normally sets that; if the deploy
says it could not:

```
gcloud functions add-invoker-policy-binding redeemYouthCode --region=europe-west2 --member=allUsers
```

**It signs a custom token**, so it needs the same IAM step as
`churchShowRedeem` — *Service Account Token Creator on itself*. If you have
already done that for ChurchShow, it is done for this too; it is one setting
on the account, not one per function.

### The order, and it matters

**Deploy this before the rules.** After the rules land, `youthGrants` is shut
to every page, so if the function is not there **no young person can redeem a
code at all** — they get "we could not check that code just now". Before the
rules land, the old page would still work, but the page has already been
changed to use the function, so in practice: deploy the functions, then check
a code redeems, then the rules.

### What to check by hand

1. In the hub's youth panel, send yourself a code for a young person whose
   household has your address on it.
2. Open **youth-access.html** in a private window, type the code, and you
   should be in, greeted by their **first name only**.
3. Try the same code again: *"That code has already been used."*
4. Press **Revoke** against it in the panel, then open the Youth Hub on that
   device — it should stop working straight away, not in an hour.

### One thing that changed for the office

Codes now record **which record the parent is** (`parentId`), and the rules
refuse a code that does not name a parent with an address on file. Nothing to
do by hand — the panel fills it in — but a code written any other way is
refused, which is the point.

## Phone notifications: the sending side (13 October 2026)

**Seven more functions, twenty in all.** They deploy with the same command
as everything else:

```
cd functions
npm install
cd ..
firebase deploy --only functions:hub --project egbc-worship-planner
```

(`npm install` again, because one library was added: `google-auth-library`.)

| Function | What it sends | When |
|---|---|---|
| `callParent` | "Please come to Little Ones / Collection code K7P2", to that child's parents' phones | a leader presses "Call on their phone" |
| `notifyTest` | a test, to the person who asked | "Send me a test" on Notifications |
| `rotaReminders` | "You are serving tomorrow" | 17:00 London, every day |
| `bookingNotify` | a room booking confirmed, approved, declined or cancelled | when its status changes |
| `maintJobNotify` | a new maintenance job, to the Maintenance team (and F-129's email) | when a job is reported |
| `urgentNotice` | a notice the office ticks "Urgent" | once, when it is posted |
| `checksReminders` | a DBS check or training running out | 09:00 London, every Monday |

Anybody with no phone set up is **emailed** instead, except for booking news,
which the booking page emails already.

### The database's region: confirmed

**`bookingNotify`, `maintJobNotify` and `urgentNotice` run when the database
changes, and Google requires them to run in the same place as the database.**
They are set to `europe-west2` (`TRIGGER_REGION` in `functions/index.js`), and
the reviewing window read the database's location as **europe-west2** on
13 Oct 2026 (`firebase firestore:databases:get`, as the church account).

### NOTHING IS SENT UNTIL MARTIN SWITCHES IT ON (A-081)

Deploying puts the timers and triggers live against the real database. With
email as the fallback for everybody who has no phone set up, which today is
everybody, they would start emailing real people before launch. So there
is a **master switch, OFF by default**:

- `churchSettings/notifications` → `live`. Off unless it is exactly `true`.
  Only a master admin may set it (the rules say so, from switch-over).
- While it is off, every timer and trigger writes what it **would** have sent
  to `notifyLog` (counts only, `dryRun: true`) and sends nothing: no phone
  message, no email. Calling a parent says it is not switched on yet.
- **"Send me a test" works anyway**, to the person who pressed it. That is the
  real-phone proof (N-7).
- Switching it on later loses nothing: a dry run doesn't use up the once-only
  markers.

**To turn it on or off:** Menu → Core Team → Admin → **Church settings** →
**Phone notifications** → the switch. It asks "Turn them on?" first. Only a
master admin sees it. No Firebase console needed.

**Until switch-over the rules are not deployed**, so the live database does
not yet stop somebody else setting `live`. Only that switch writes it, and
only master admins are shown it.

### What a deploy creates and what it updates (checked 13 Oct 2026)

Read off the live project by asking each function's public address with a
plain GET, which runs none of their code (`findMe` was not POSTed to,
because that would write a rate-limit record).

**Updated (already live, moved to Node 22):**

| Function | Safe before switch-over? |
|---|---|
| `rotaFeed`, `myCalendarLink`, `myCalendarLinks` | **Yes.** Live since 9 Oct; calendar links keep working |
| `bookingReminders`, `documentExpiryReminders` | **Yes.** Live since 9 Oct (timers can't be checked from outside; this file records them). Their emails now carry the Google identity token |

**Created (not live yet):**

| Function | Safe before switch-over? |
|---|---|
| `whoAmI` | **Yes, and wanted.** v2 pages already ask it who somebody is, and without it they fall back to "we do not recognise that address" |
| `findMe`, `myDates`, `saveAnswer` | **Yes.** The v2 availability form's three calls; the original site's form is untouched |
| `churchShowPairingCode`, `churchShowRedeem`, `churchShowDisconnect` | **Yes.** Nothing calls them until a projection PC is paired; `churchShowRedeem` also needs the IAM step |
| `redeemYouthCode` | **Yes.** Only a young person's code uses it |
| `notifyTest` | **Yes.** Sends only to the person who presses it |
| `callParent` | **Yes.** Refuses while the switch is off |
| `rotaReminders`, `checksReminders` (timers) | **Yes.** Dry run while the switch is off: logs, sends nothing |
| `bookingNotify`, `maintJobNotify`, `urgentNotice` (triggers) | **Yes.** Same. The first deploy of a trigger may take a few minutes and may ask to retry while Google sets up its permissions |

### Added since (13 Oct 2026, later): the family

Two more, created by the same command:

| Function | Safe before switch-over? |
|---|---|
| `myFamily` | **Yes.** The app's "Your family this week": reads the household and this week's rota and group meetings, first names only; also keeps the caller's own `familyGroups` right |
| `familyGroupsSync` (trigger on the address book) | **Yes.** Writes only `familyGroups` onto parents' records, and only when it changes. Sends nothing |
| `myYouthHub` | **Yes.** The Youth app's "My rota and charters": a young person's (or adult's) own rota slots and their own charters. Reads only |
| `feedSync` (timer, every 60 minutes) | **Yes.** Reads the sermon podcast feed and the YouTube channel feed into `sermons` and `videos` (F-164). Adds and updates; never deletes, never touches the live link. Does nothing for a part with no address set, or switched off |

### Added 14 Oct 2026: who gets told (Care & support, prayer, hellos)

Five more, created by the same `functions:hub` deploy:

| Function | Safe before switch-over? |
|---|---|
| `worryNotify` (trigger on `worries`) | **Yes.** A request for pastoral care or a concern: the people named in Church settings › Who gets told are told **which kind** came in, nothing more. Safeguarding concerns: the safeguarding lead and deputy only. Nobody named: the lead and deputy. **Never the church office.** A dry run while the notifications switch is off |
| `prayerNotify` (trigger on `prayers`) | **Yes.** The same for a prayer request, plus the prayer team when the person chose it |
| `helloNotify` (trigger on `welcomes`) | **Yes.** Tells the welcomers a visitor said hello, with no details. The church's copy of the hello is the events window's `publicMailNewHere` (F-168, already live), not this |
| `careStatusFromSettings`, `careStatusFromSite` (triggers on `safeguardingSettings`, `bookingSettings`) | **Yes.** Keep `careRouting/status` (is a safeguarding lead set, and who) for the forms and the hub's warning. Write nothing else |
| `careStatusSync` (timer, every 60 minutes) | **Yes.** The same note, by itself: written the first time and whenever the answer changes, so no church ever has to press Save to make it work |

**Nothing to press after the deploy.** `careStatusSync` (every 60 minutes) writes `careRouting/status` by itself the first time and whenever the answer changes, and the hub's warning works it out directly until then.

**For Calla's sendEmail (the known-recipient check):** the addresses the church can choose here are `careRouting/main.care.email`, `careRouting/main.pastoral.email`, `careRouting/main.prayer.email` (`welcomeSettings/public.notifyEmail` is the events window's, for its own copy). They need to count as known recipients, or those emails will be refused once the open path closes.

### Added 15 Oct 2026: enter a Sunday once

One more, created by the same `functions:hub` deploy:

| Function | Safe before switch-over? |
|---|---|
| `rotaWhatsOn` (trigger on `events`, the rota) | **Yes.** A rota service ticked "In What's On" with a service time is copied to `calEvents/rota_<id>` (public: title, a line, the speaker, the time). Unticked, archived or deleted: the copy is removed. Writes nothing else. Existing services have no tick, so nothing appears until somebody ticks one (or the F-177 Sundays script runs) |

**Nothing to press after the deploy.** It acts on the next change to each service.

### Added 16 Oct 2026: who may email whom

One more, created by the same `functions:hub` deploy:

| Function | Safe before switch-over? |
|---|---|
| `compilerSend` (callable) | **Yes.** The Email Compiler sends through it: the church office and master admins to anyone, a team leader to the people on their teams (and themselves), anybody else refused. Each email is logged in `emailOutbox` (Emails sent). Until it is deployed the page falls back to the old direct send (no check), so deploy it with this push. |

### Deploying N-4, step by step (Martin, with a window watching)

1. In the `v2` folder: `git pull`, so the code is today's.
2. `cd functions`, then `npm install`, then `cd ..` (a library was added).
3. `firebase login` if asked, as the church account.
4. `firebase deploy --only functions:hub --project egbc-worship-planner`
   - It should say **nodejs22** against each function.
   - It must **not** offer to delete anything. If it names `sendEmail`, say
     **no** and stop.
   - If a trigger says to retry because permissions are still being set up,
     wait five minutes and run the same command again.
5. If not done before: the IAM step for `churchShowRedeem` (above).
6. **Leave the switch OFF.** Church settings → Phone notifications should
   say "Off".
7. **The real-phone proof (N-7), on your own phone first:** open the app,
   Me → Notifications → turn on → "Send me a test". It should arrive.
   Then the same on an iPhone added to the Home Screen.
8. Look at Firestore → `notifyLog` the next morning: the 17:00 rota reminder
   should show as a `dryRun` with counts, and nobody should have had
   anything.
9. **Only at launch:** Church settings → Phone notifications → switch on.

### The hub's emails now carry the server's Google identity

Every email the hub's functions send (reminders, notifications) now carries a
Google identity token for `sendEmail`'s address, from
`199442060489-compute@developer.gserviceaccount.com` (NEXT-BRIEF §26 item 4b).
Calla's `sendEmail` accepts this already (Step 1, live 12 Oct). If a token
can't be got, the email goes without one, which still works until
switch-over. Each row in `emailOutbox` now says `auth: google` or
`auth: none`. **After deploying, look at the next reminder's row: it should
say `google`.** If it says `none`, tell the main window before switch-over,
because on that day Calla stops accepting emails without one.

### What to check by hand

Once the events window's phone side (N-5) is live too, with made-up names, on
a real Android phone and a real iPhone: N-7 in `FINDINGS-notify.md`.

### If something goes wrong

**To stop the timers at once:** Cloud Scheduler, the job (`rotaReminders` or
`checksReminders`), **Pause**. **To stop the rest:**

```
firebase functions:delete callParent notifyTest bookingNotify maintJobNotify urgentNotice --region=europe-west2
```

Nothing else depends on them. The pages say "use Show on screen or ring
them" when `callParent` isn't there.

## Then check it, by hand, before telling anyone

### The calendar links

**5. After any redeploy, open one link you already have** and check it still
answers — paste it into a browser and look for `BEGIN:VCALENDAR`. The
addresses do not change when the runtime does, so a link that stops working is
the first sign something went wrong, and the fix is to redeploy rather than to
tell anybody to re-add anything.

Then, for a first deploy or when something has changed: open the hub, open the
Menu, press **My rota**. You will see the three
choices. Press **Add to my calendar** on "Just me", copy the address and paste
it into a browser: you should get a file of text beginning `BEGIN:VCALENDAR`
with your own slots in it and nobody else's.

**6.** Do the same for **My household** — check it holds the rest of your
house — and for **The full rota**, which should hold the teams you would see
on the read-only rota and no others.

**7. Check a reset does what it says.** Press **Reset this link** on one of
them. Paste the old address in again: you should get "Not found". Then check
the **other** links still work. That last part is worth doing by hand, because
it is the whole reason each feed has its own key.

### The reminders

**8.** The booking reminder runs at 09:00 London. To see it work without
waiting until tomorrow, open the Google Cloud console, **Cloud Scheduler**,
find the job for `bookingReminders` and press **Force run**.

**9. Then look at what it did, before believing it.** In Firebase, open
Firestore and look at the **`emailOutbox`** collection. Every message the
server sends is written there — who it went to, the subject, and whether it
worked. On the day it goes live this is the thing to read: if the list is
empty, nothing went; if it is full of addresses you do not recognise,
something is wrong and you can stop the job before the next run.

**10.** Do the same for `documentExpiryReminders`.

**11. Only then tell anybody.** My rota is in the Menu for everyone already;
the reminders need no telling, they simply arrive.

---

## If something goes wrong

**Nothing on the site breaks.** The feeds are separate addresses and no page
depends on them; the reminders are timers and no page depends on them either.

**To stop the reminders at once**, without a deploy: Cloud Scheduler, the job,
**Pause**. That is the one to reach for if people start getting email they
should not — it takes effect immediately and nothing else is touched.

**To take the whole thing out:**

```
firebase functions:delete rotaFeed myCalendarLink myCalendarLinks bookingReminders documentExpiryReminders --region=europe-west2
```

and the site carries on exactly as before.

---

## What it costs

- **The feeds** run when a calendar app asks, roughly every few hours per
  person. For a team of fifty with one feed each that is a few thousand calls
  a month. Somebody with three feeds is three subscriptions, so the honest
  figure is a few thousand times however many people actually add — still well
  inside the free allowance.
- **The reminders** run twice a day, full stop. Two calls.

---

## How it was checked, and what the checks cannot tell you

All of it on the emulator, with invented people. **Nothing was sent to
anybody**, and there are two separate reasons it could not have been: on the
emulator the functions write every message to `emailOutbox` and make no
request at all, and every invented address ends `.invalid`, which the RFCs
reserve so that it can never resolve.

| Check | What it covers |
|---|---|
| `tests/check-rota-feed.mjs` | 45 — the feeds, server-side, including the three kinds and resetting one link without touching the others |
| `tests/check-calendar-end-to-end.mjs` | 23 — the same, driven through the hub as a person would |
| `tests/check-reminders.mjs` | 38 — the two timers, including running each one twice and getting nothing the second time |

**What none of them can tell you** is whether `sendEmail` actually delivers.
The emulator never calls it. The first real test of that is step 8 above, and
it is why step 9 says read the outbox rather than assume.
