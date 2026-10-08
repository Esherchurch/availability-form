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
