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
5. **The page posts it to `redeemYouthCode`** and reads nothing itself. The
   function checks the code with the Admin SDK, creates the identity
   (`youth-` and twenty random characters, no email address, no password),
   writes `youthAccess/{uid}`, burns the code **in one transaction**, and
   answers with a custom token and the child's **first name only**.
6. **The page signs in with that token.** It never saw the grant document, so
   it never saw the parent's address.
7. **The code is burnt.** `youthGrants/{code}` has `redeemedAt` and the `uid`
   that used it. A forwarded copy is worthless from that moment, and a
   mistyped code leaves no account behind — the old order signed in first and
   checked second.
8. **That device is in for six weeks** (`WEEKS` in `youth-access.html`). The
   hub's panel offers to send renewals for anything with fourteen days or
   fewer left; the old code keeps working until it expires.
9. **Revoke stops it at once.** `revokeGrant()` sets `active: false` on both
   the grant and the access record, and `youthGranted()` reads that on every
   request — so it is immediate, not "within the hour".

---

## The three things involved

| | What it is | Who may touch it |
|---|---|---|
| `youthGrants/{code}` | one issued code. `memberId`, `parentId`, `memberName`, `sentTo` (the **parent's** address), `issuedBy`, `redeemedAt`, `uid`, `active` | **shut to every page.** An admin creates, lists and cancels; `redeemYouthCode` reads and burns it with the Admin SDK. Creating one is checked against the household — see below. |
| `youthAccess/{uid}` | one signed-in device. `memberId`, `memberName`, `firstName`, `grantCode`, `redeemedAt`, `expiresAt`, `active`. **No email address.** | **written only by `redeemYouthCode`.** Read by that device and by admins. Changed only by an admin. |
| the device account | `youth-` and twenty random characters, with the child's first name as its display name. No email, no password. | nobody. Created by the function on success only. |

---

## What `youthGranted()` opens

A young person's phone is **a device account plus a live `youthAccess`
document**. That is all `youthGranted()` asks: signed in, a record exists for
this uid, `active == true`, and `expiresAt` is still in the future.

(It was an *anonymous* account until 9 October 2026. Redeeming through a
function means the identity is made by the function on success, so a mistyped
code no longer leaves a disposable account behind.)

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

1. **A six-week code on a lost phone works until it expires**, unless somebody
   revokes it. Revoking is immediate; noticing is not automatic.
2. **One device per code**, by design — the code is burnt on redemption. A
   young person with a new phone needs a new code, which means the parent is
   asked again. That is the point rather than a limitation.
3. **A refusal says which of three things went wrong** — unrecognised,
   cancelled, already used — where ChurchShow's pairing gives one sentence for
   every failure. It is a small oracle: it says a code once existed. Against
   36⁸, about 2.8 trillion, on codes that are single-use and live six weeks,
   and against the value of telling a fourteen-year-old "that one has been
   used, ask for another" rather than "no". Deliberate, and worth knowing.
4. **The rules cannot check that the email was actually sent.** They check the
   grant names a parent with an address on file; whether `sendEmail` delivered
   it is between that function and Resend.

### Two things that WERE on this list and are not any more

Both were closed on 9 October 2026, on Martin's instruction, and both are
worth keeping a record of because they shaped the design.

**The grant document was readable by whoever held the code**
(`allow get: if true`), and it holds `sentTo` — the parent's email address.
That was not an oversight: the page looked the code up before anybody was
signed in, which is how redemption worked. `redeemYouthCode` does the lookup
now, with the Admin SDK, and the collection is shut to every page.

Closing it turned up something the rules had let through all along:
**marking a code used needed no read**, so even with `get` shut a phone could
have blind-written `redeemedAt` and `uid` onto somebody else's live code and
burnt it. Nothing read it back, so nothing would have noticed until a real
code stopped working. The clause that allowed it is gone, and a rules check
expects the refusal.

**The parent requirement lived in the page**, not the rules: `youthGrants`
create was `isAdmin()`, so an admin could have written a grant by hand for a
child with nobody behind them. It is `grantHasParent()` now, and it asks about
the household rather than about a typed address — the record must be a child,
its household head must be the record named as the parent, and that record
must carry the address the code is going to. Eight checks, and a deliberate
break (the one Martin named) fails all eight.

---

## How it is checked

| | |
|---|---|
| The rules, in four states — a live code, an expired one, a cancelled one, and no code at all | `firestore-rules.test.mjs` |
| The parent requirement, eight ways, each written directly as an admin | `firestore-rules.test.mjs` |
| A code redeemed and the app opened, on a phone-sized screen | `tests/check-youth-access.mjs` |
| The three refusals, straight at `redeemYouthCode` | `tests/check-youth-access.mjs` |

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
