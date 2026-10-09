# Youth access

How somebody under sixteen uses the Youth Hub on their own phone without
having an account, and without the church holding their email address.

`firestore.rules` refers to this file from `youthGranted()`. It was referred to
for about a fortnight before it existed, which is how the launch blocker below
went unnoticed.

---

## Martin's two principles

These are not design preferences. They decide everything else on this page.

> **No email addresses for under-18s, ever.**
>
> **No young person gets in without a parent receiving the code.**

Everything below is an arrangement for holding both while still letting a
fifteen-year-old on the youth worship team plan a service on the bus.

---

## How it works, in order

1. **The office ticks "Under 16"** against the young person in the address
   book, and links them to a household. Both are needed: `youngPeople()` in
   `hub-app.js` is `isMinor === true && householdId`.
2. **A leader presses "Send code"** in the hub's youth panel. Who may: a master
   admin, or an admin of Kids Church, Youth Worship, Lazers or ReNu
   (`canIssueCodes()`).
3. **The code is emailed to the parent**, never to the young person —
   `parentFor(member)` reads the email address off the *household head's*
   record, and the panel refuses to send if there is not one. The email says
   *"Please pass this to them rather than forwarding the email"*, and *"If you
   would rather they did not have access, simply do not use it."*
4. **The young person types the code** into `youth-access.html`. Eight
   characters, shown as `XXXX-XXXX`.
5. **The page signs them in anonymously** — a Firebase account with no email
   address, no password and no name — and writes `youthAccess/{uid}`.
6. **The code is burnt.** `youthGrants/{code}` gets `redeemedAt` and the `uid`
   that used it. A forwarded copy is worthless from that moment.
7. **That device is in for six weeks** (`WEEKS` in `youth-access.html`). The
   hub's panel offers to send renewals for anything with fourteen days or
   fewer left; the old code keeps working until it expires.
8. **Revoke stops it at once.** `revokeGrant()` sets `active: false` on both
   the grant and the access record, and `youthGranted()` reads that on every
   request — so it is immediate, not "within the hour".

---

## The three things involved

| | What it is | Who may touch it |
|---|---|---|
| `youthGrants/{code}` | one issued code. `memberId`, `memberName`, `sentTo` (the **parent's** address), `issuedBy`, `redeemedAt`, `uid`, `active` | an admin creates, lists and cancels. Anybody holding the code may `get` it — that *is* the redemption. Nobody may list it. |
| `youthAccess/{uid}` | one signed-in device. `memberId`, `memberName`, `grantCode`, `redeemedAt`, `expiresAt`, `active`. **No email address.** | written once by the device redeeming, against a live unredeemed code. Read by that device and by admins. Changed only by an admin. |
| the anonymous account | a Firebase uid and nothing else | nobody. It is not linked to a person, an address or a password. |

---

## What `youthGranted()` opens

A young person's phone is an **anonymous account plus a live `youthAccess`
document**. That is all `youthGranted()` asks: signed in, a record exists for
this uid, `active == true`, and `expiresAt` is still in the future.

It grants **read** on exactly what `youthapp2.html` asks for:

| Collection | Why the youth app needs it |
|---|---|
| `songs` | the library the planner picks from, and the key chooser |
| `services` | the plans themselves, and the last key a leader used for a song |
| `events` | which services there are, so one can be chosen to plan |
| `portal/dashboardContent` | the notices on the home screen. That one document only |
| `kb_playthrough` | **published articles only** |
| `kb_training_worship` | **published articles only** |
| `worshipBoardState/youth` | the youth pin board |

The two knowledge bases are limited to published articles by the rule, and the
app's own query already asks for `published == true` — which is what makes that
expressible: for a list, Firestore allows a query whose own `where` clauses
guarantee the rule, and refuses one that does not.

**`worshipBoardState/youth`, and not `state`.** `state` is the worship team's
board. `youthapp2.html` read and wrote `state` until 9 October 2026, which was
wrong twice over: it showed the youth the worship team's notes, and it would
have been refused anyway for an adult on Youth Worship, who is not on the
Worship Team.

### What it never opens

**`addressBook`. Not one record, not ever.** Rules cannot hide fields, so
granting a single record would grant every field of it — name, email address,
telephone number, household. On a child's phone.

Also closed: `availability`, `users`, `news`, `resources`, the rest of
`portal`, the other two pin boards, every other person's `youthAccess`, and
everything not in the table above.

### Read only, everywhere

A young person writes nothing. That is not a new restriction: saving a service
plan has always needed `canAct('Youth Worship')`, the board needs the team, and
the song library needs an admin. What *is* new is that the app says so.

`saveSchedule()` had no `catch`, so the write was refused, the promise
rejected, and the "saved successfully" line never ran — no alert, no error, no
sign anything had happened. A young person now gets: *"Only a youth leader can
save the plan. Show them what you have put together and they will save it."*

### What a young person does see, said out loud

`events` carries `assignments`, `serviceLeader` and `speaker`, so a young
person sees **who is serving, by name**, on every service — not only youth
ones. Names only: events hold no telephone number, no address and no email,
because those live in the address book and that is shut. This is written down
rather than left to be discovered.

---

## The email button

The youth app can email a service plan to the team. That needs the adults'
email addresses, which must never be on a child's phone — so:

- the address book is read **only** when a signed-in volunteer is looking
  (`onTheYouthTeam()` in `youthapp2.html`), and a young person's phone does not
  ask for it at all
- a young person pressing the button is told *"A leader sends the plan out.
  Ask one of them, or save it and they will see it."*

The names on the plan come from the rota table, which comes from the event, not
from the address book.

**It read the whole address book unconditionally until 9 October 2026** —
every adult's name, email address, telephone number and household, onto
whatever phone had the page open. The rules would refuse it now in any case,
but a page that asks and is refused is a page that starts working the day
somebody widens a rule by mistake.

---

## What this does not protect, and is worth knowing

1. **`youthGrants/{code}` is `allow get: if true`, and the document holds the
   parent's email address.** Anybody holding a code can read `sentTo`,
   `memberName` and `memberId`. The code is the password and the open read is
   what lets `youth-access.html` look it up *before* signing anybody in. Two
   ways to close it, neither done:
   - sign in anonymously first and make it `request.auth != null` — cheap, but
     it leaves a disposable account behind on every wrong code
   - redeem through a function, so the page never reads the grant at all. That
     is the proper fix and it is the same shape as `whoAmI`
2. **The parent requirement lives in the page, not in the rules.**
   `youthGrants` create is `isAdmin()`, so an admin could write a grant by hand
   for somebody with no parent on file. `sendCode()` refuses to, and the "Under
   16 plus a household" filter is what the panel offers — but the rules do not
   enforce it.
3. **A six-week code on a lost phone works until it expires**, unless somebody
   revokes it. Revoking is immediate; noticing is not automatic.
4. **One device per code**, by design — the code is burnt on redemption. A
   young person with a new phone needs a new code, which means the parent is
   asked again. That is the point rather than a limitation.

---

## How it is checked

| | |
|---|---|
| The rules, in four states — a live code, an expired one, a cancelled one, and no code at all | `firestore-rules.test.mjs` |
| A code redeemed and the app opened, on a phone-sized screen | `tests/check-youth-access.mjs` |

The browser check holds both principles directly: it seeds an adult with a
deliberately distinctive email address, telephone number and street, and fails
if any of them appears **on screen or in the page's own memory**. The first
version looked only at the DOM, and a deliberate break — putting the address
book read back — passed it, because the data was loaded and simply not yet
drawn. In memory on a child's phone is the thing being forbidden, so it looks
at both now.

Six deliberate breaks are known to be caught: granting the address book,
granting the worship board, granting any write, forgetting that codes expire,
forgetting that codes can be cancelled, and the page reading the address book
again.
