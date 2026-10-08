# Putting the server side live — one set of steps

**Nothing here has been deployed.** This is the whole of what the `hub`
codebase holds, written down so it goes live in one go rather than four.

There are **five functions**, and they are all in `v2/functions/`:

| Function | What it is | When it runs |
|---|---|---|
| `rotaFeed` | a person's calendar, as a subscription | whenever a calendar app asks |
| `myCalendarLink` | makes or resets one of their calendar links | when they press a button in the hub |
| `myCalendarLinks` | which links they already have | when they open "My rota" |
| `bookingReminders` | "your room is booked tomorrow" | 09:00 London, every day |
| `documentExpiryReminders` | a hirer's insurance running out | 09:30 London, every day |

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

**2. Install what the functions need**, once:

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

**4. Say the feed may be opened without signing in.** A calendar app cannot
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

**5.** Open the hub, open the Menu, press **My rota**. You will see the three
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
