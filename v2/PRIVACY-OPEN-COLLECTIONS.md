# The address book is readable by anyone on the internet

**A launch blocker. Nothing has been changed — this is for Martin to decide.**

---

## 1. What is open, and what that means today

Three collections are open in `firestore.rules`. A rule is not a page: anyone
who knows the project id can read an open collection straight from their own
browser, without visiting the site, and nothing in the logs distinguishes them
from a member.

| Collection | The rule | What a stranger can get |
|---|---|---|
| `addressBook` | `allow read: if true` | **every name, email address, telephone number, household link and team**, for the whole church, in one request |
| `events` | `allow read: if true` | every service and meeting — and each one carries `assignments`, so **who is serving, by name**, plus the service leader and the speaker |
| `availability` | read is closed, but `create, update` is open | anyone can **write an answer for any member id** they have seen |

The third is not in the brief and is worth saying out loud: the rule checks
that an answer *looks like* an answer, not that it is yours. Someone who has
read the address book (which they can) has every member id, and can mark
anybody available or unavailable for anything.

**This is true today and it stays true after switch-over.** The comment in the
rules says "Open, for the availability form", which is accurate about why, and
says nothing about what it costs.

---

## 2. Why it is open

**Two pages**, and the second one is the awkward part.

### `index.html` — the public availability form

It does exactly three things:

```js
// 1. who are you
query(collection(db, "addressBook"), where("email", "==", emailInput))
// 2. which Sundays are there
query(collection(db, "events"), orderBy("date"))
// 3. this is when I can serve
setDoc(doc(db, "availability", …), …)
```

There is no account behind the form by design: the whole point is that
somebody on the Kids Church rota who has never signed in to anything can be
emailed a link and fill it in.

**What the form actually uses** — and this matters, because it is far less than
what the rules hand over:

- from a person: `id`, `name`, `markers` (their teams). It never shows a
  telephone number or an address.
- from an event: `id`, `date`, `startTime`, `endTime`, `type`, `description`,
  `termLabel`, `teams`, `archived`. **It never shows `assignments`, the
  service leader or the speaker.**

So the open rules are giving away a great deal more than the form needs.

### `youthserviceplanner.html` — and this one changes the cost

It reads **the whole address book**, not a query:

```js
await ready;                                     // the session, user or null
const emailSnap = await getDocs(collection(db, "addressBook"));   // all of it
const snap      = await getDocs(collection(db, "events"));        // all of it
```

It builds a name list for the planner, and it **never checks that anybody is
signed in** — `await ready` resolves with `null` just as happily as with a
user. Today that works, because the rule is open.

**Close the rule and this page stops working for anyone not signed in** — and
it has no sign-in prompt, because it is the installable offline app (A-025).
The youth team would open their planner and get an empty name list and no
dates, with nothing on screen saying why.

This page is easy to miss: its reads sit in a module at the foot of the file,
not near the top, which is the same reason A-025 was wrong about it. It is also
the kind of breakage that only shows up on a Sunday, so it is named here in the
table below rather than left to be found.

---

## 3. Three ways to close it

### Option A — a callable that answers only about you *(the brief's suggestion)*

One unauthenticated function in codebase `hub`, beside the calendar feeds,
with three jobs:

| Call | Takes | Gives back |
|---|---|---|
| `findMe` | an email address | the matching people, as `{ id, name, markers }` and nothing else |
| `myDates` | a member id | that person's relevant events, as `{ id, date, startTime, endTime, type, description, termLabel }` — **no assignments, no leader, no speaker** |
| `saveAnswer` | member id, event id, status | writes the one answer |

Then the rules become `allow read: if active()` on both collections, and
`availability` loses its open write.

**What it costs:** one function, a morning's work, and `index.html` changes
from three Firestore calls to three function calls. No change to how anybody
uses the form.

**What it does not fix.** `findMe` is still an **oracle**: anyone can type an
address and learn whether that person is in this church's address book, and
their name. That is enormously less than today — no telephone numbers, no
households, no bulk download, no list to enumerate — but it is not nothing. A
person who already knows somebody's email can confirm they attend this church.

Worth adding if you take this option: the function counts attempts per IP in
Firestore and stops answering after, say, twenty in an hour. That turns
"download the lot" into "guess one address at a time, slowly", which is the
difference between a breach and a nuisance.

### Option B — email them a link instead *(strongest, and the machinery exists)*

The form asks for an email address and says *"if we have you, we have sent you
a link."* It says the same thing whether or not the address is known. The link
carries a one-time key, and only that key opens the form, already filled in
with who you are.

**The oracle disappears entirely**: a stranger learns nothing from the form,
because the form tells them nothing.

`login.html` already does exactly this — "No password needed. We'll email you
a link that signs you straight in" — and the one-time key pattern is the same
one `rotaFeed` and the youth access codes use. It is not new ground.

**What it costs:** the same function, plus the emailing, plus a key store. And
it changes what people do: today you type your address and the form opens; with
this you type your address, go to your email, and come back. For somebody
filling in a rota on a Sunday afternoon that is a real cost, and some people
will not finish.

### Option C — leave `addressBook` open and close `events`

If the oracle is judged acceptable, `events` can still be closed cheaply: the
form only needs dates and types, so `myDates` alone removes **who is serving,
by name** from public view. That is the part of today's exposure most likely to
upset somebody.

**I do not recommend stopping here**, but it is a third of the work for a
meaningful part of the benefit, and it could ship first.

---

## 4. What I would do

**Option A, with the rate limit** — and `availability` closed to direct writes
at the same time, because that one has no argument for it at all.

The reason is the balance of harm against friction. Option B is strictly more
private, but it puts an email round trip between a volunteer and a form they
are already reluctant to fill in, and the thing it protects against — someone
confirming that a person whose email they already have attends this church —
is a long way less serious than the whole address book being downloadable.

If you would rather have B, it is the same function with a different front
door, and the choice can be changed later without touching the rules again.

**Either way, `events` and `availability` should close.** They are not what the
open rule was for.

---

## 5. What breaks, and how it would be checked

| Thing | Effect |
|---|---|
| `index.html` | rewritten to call the function; same screens, same order |
| **`youthserviceplanner.html`** | **breaks unless it is dealt with** — see below |
| Every other signed-in page | none — they read as `active()` already |
| The events window's public pages | none — hire, room and book use their own collections |
| The rota feed, the reminders | none — Admin SDK, which does not go through the rules |

**The youth planner needs one of three things**, and it is a decision, not a
detail:

1. **Give it sign-in.** This is A-025, which you have already seen: it means
   adding the Firebase SDK and `egbc-auth.js`, and the page stops working
   without a signal. It is an offline app today.
2. **Let it use the same function.** `findMe` is the wrong shape — it wants
   the whole list — so it would need a `teamList` call returning
   `{ id, name }` for one team and nothing else. That is honest: a name list
   is all it uses.
3. **Leave `addressBook` open and close only `events`** (Option C), which
   leaves the planner alone.

My own preference is (2): it keeps the page working as it does now, it hands
out names only, and it is perhaps an hour on top of Option A.

Before anything is deployed:

- a check that signs **out** and proves `addressBook` and `events` refuse, and
  that the function still answers
- a check that the function returns **only** the named fields — the test fails
  if a telephone number, an address or an `assignments` map ever appears in a
  reply
- a check that `availability` refuses a direct write
- the existing `firestore-rules.test.mjs`, extended
- the availability form driven end to end on the emulator, with invented
  people, to prove a volunteer can still answer
- **the youth planner opened signed out**, to prove it still builds its name
  list — the check that would have caught what I nearly missed

**Nothing in this document has been built or changed.** Say which option and I
will build it.
