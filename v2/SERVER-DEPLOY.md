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

Find the service account the functions run as — the deploy prints it, and it is
usually `egbc-worship-planner@appspot.gserviceaccount.com` — then, once:

```
gcloud iam service-accounts add-iam-policy-binding ^
  egbc-worship-planner@appspot.gserviceaccount.com ^
  --member="serviceAccount:egbc-worship-planner@appspot.gserviceaccount.com" ^
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
