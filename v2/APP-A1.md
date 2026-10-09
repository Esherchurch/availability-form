# App design, stage A1 — established

**Nothing is built.** This is what the phone app needs, read off
`design/app-mockup.html` (the design Martin approved) and off the pages that
exist, not off a plan. Every page named here was confirmed present; every
claim about what a page does was made with the file open.

NEXT-BRIEF §22 asks for four things. They are sections 1 to 4. Sections 5 and
6 answer the events window's F-130 and F-131, which are blocking them.

---

## 1. What each space and screen needs from existing pages

APP-DESIGN-BRIEF §5 is the rule: **if a v2 page already does the job, the app
opens that page.** So each screen below is one of three things:

- **opens** — a link out to a page that already does it. No new screen.
- **reads** — new phone layout over data that already exists.
- **new** — section 2.

### Me and my family

| Screen | What it needs | From |
|---|---|---|
| `me_home` · You are serving | the next dates, role, arrival time | **reads** `events` (assignments). `hub-app.js:1259 renderServing()` already works this out — move that logic, do not rewrite it |
| · This Sunday, for parents | the family check-in QR and a check-in button | **events window's** (F-121). Their helper, my layout |
| · Your family this week | serving and groups for the household | **new function** — section 3 |
| · Your events | what they have booked or signed up to | **events window's** `myEvents()` (A4) |
| · Notices | two or three | **reads** `news`. `hub-app.js` already draws these |
| · Your groups | the next meeting | **events window's** `myGroupsNext()` (A4) |
| `me_whatson` | events, sign-ups, Book a room | **opens** `whatson.html`, `signup.html`, `rooms.html` — all theirs |
| `me_listen` | sermons, series, carry on listening | **reads** `sermons` and `sermonSeries`, built by the events window on 10 Oct. The player is theirs; **the feed is mine** (F-133) |
| `me_me` · My details | name, phone, address, who can see them | **new** — section 2 |
| · My household | who is in it | **new function** — section 3 |
| · My groups | | **opens** `groups.html` |
| · Add to my calendar | just me, household, whole rota | **exists**: the `myCalendarLinks` function, five feeds, already live |
| · Notifications | | **new**, and deliberately later (§7; `FINDINGS-notify.md`) |
| · My availability | | **opens** `index.html`. §5 is explicit: the app never rebuilds the availability form |
| · Giving | | **new** — section 2 |
| · Sign out | | **exists**: `EGBCAuth.signOut()` |

### A team space (Welcome, Tea & Coffee, and the shape for any simple team)

| Screen | What it needs | From |
|---|---|---|
| `*_rota` | my dates for this team, and a link to the whole rota | **reads** `events`; **opens** `view-only-rota.html` |
| · Next term | "say which Sundays you can do" | **opens** `index.html` |
| `*_sunday` | the leader's notes, and who is on with me | **reads** `events` + `services`. The notes field is **new** — section 2 |
| `*_team` | how we do it · message the team · team resources | **opens** the charter page where one exists (`Worshipteamcharter.html`, `Youthcharter.html`, `Coreteamcharter.html`) and `resources.html`. **Message the team is new** — section 2 |

### Worship & AV

| Screen | From |
|---|---|
| `worship_rota` | as above, plus **opens** `Planner.html` for leaders |
| `worship_sunday` | **reads** `services` (running order) and `events` (who's on). `SundayServicePlanner.html` writes it |
| `worship_learn` | **opens** `EGBC-HowTo-AV.html`, `EGBC-Troubleshoot-AV.html`, `EGBC-PlayThrough.html`, `EGBC-Training-Worship.html`. Four pages, all there |
| `worship_team` | **opens** `Worshipteamcharter.html`, `stickynotes.html?board=worship`, `meeting.html`, `resources.html` |

### Kids Church

| Screen | From |
|---|---|
| `kids_today` | **events window's** (F-120, built 10 Oct) |
| `kids_children` | **events window's** (F-130) |
| `kids_rota` | **reads** `events`; `Planner.html` writes it |
| `kids_team` | **opens** `safeguarding.html`, `kids-admin.html` (registers), `resources.html` |

### Maintenance

| Screen | From |
|---|---|
| `maint_jobs` | **opens** or re-lays `maintenance.html` (theirs, F-123) |
| `maint_rooms` | **events window's** "Close a room" |
| `maint_team` | **opens** `resources.html`. No charter page exists for Maintenance |

### Running things

| Screen | From |
|---|---|
| `office_today` | **reads** several: room requests (`bookings`), rota gaps (`events`), forms not back (`formRequests`). All theirs except the rota gap |
| `office_people` | **opens** `addressbook.html` |
| `office_bookings` | **events window's** (A2) |
| `office_send` | **opens** `EmailBuilder2.html`; notices are the hub's admin panel; notifications are later |

**The count that matters: of 24 screens, 11 are "opens an existing page", 8
are "a phone layout over data that exists", and 5 are genuinely new.** The app
is mostly an arrangement, which is what §5 intends.

---

## 2. What is missing

Ordered by what stops the app being usable, not by size.

### a. A person cannot edit their own details

`addressbook.html` is the only place a name, telephone number or address can
be changed, and it is **admins only** (`data-admin="any"`). "My details" on
`me_me` has nothing behind it.

This is not a small gap: the whole point of the levels is that an **Attender**
has an account, and the first thing a person wants is to correct their own
telephone number. It also needs a decision Martin has not made: **who can see
what**. The mock-up's own words are *"Name, phone, address, who can see
them"*.

**What it needs:** a rule letting somebody write a named handful of fields on
`addressBook/{their own record}` — the shape is already there (`bookIsMine`
proves a record is theirs, and is already used for `allow get`) — plus a
visibility field the directory honours. **A decision for Martin**, because
"who can see my telephone number" is a policy, not a layout.

### b. Teams are not data

§6: the office adds, renames, recolours and removes teams. Today a team is
written into **five** files by hand — A-053 has the list, from adding
Maintenance. Section 4 is how.

### c. "Message the team" and "Message the group"

`EmailBuilder2.html` exists but is a Core Team tool (`data-team="Core Team"
data-role="leader"`). A Welcome team leader cannot email their own team.

**What it needs:** one function that takes a team or group and a short
message, resolves the addresses server-side and sends — which is the same
shape as F-129 (the Maintenance email) and should be **one function, not
two**. The addresses must not reach the page: that is the lesson of A-043.

### d. The leader's note for "This Sunday"

`teamSunday()` shows *"Notes from the team leader"*. No such field exists on
`events` or `services` for a team. **Needs a field and somewhere to type it**
— probably `Planner.html`, which already writes per-role notes.

### e. Giving

Nothing exists. Not a page, not a field, not a link. It is one row in the
mock-up and will be an outside service; **it needs Martin to say which**.

### f. Sermons has no role, and no Menu entry

`sermons-admin.html` exists (events window, 10 Oct) and is reachable from
nowhere — it is not in the Menu. And there is no "Sermons" team to gate it
with. Both are on the events window's new request list and are small; they
are named here so they are not lost.

### g. A "now playing" bar

Requested with the sermons work: a bar above the tabs while something is
playing. It belongs to the shell, not to a screen — section 6 says how a
screen will ask for it.

---

## 3. What the family rule needs from the data

**The household model is already right, and there must not be a second one.**
`householdId` on the address book, followed **in both directions** because the
book records households two ways — some families point at a head, some point
at each other.

| | |
|---|---|
| In a page | `EGBCRotaPdf.householdIds(addressBook, memberId)` — `egbc-rota-pdf.js:48` |
| **On the server** | `householdIds(addressBook, memberId)` — **already exported** from `functions/rota-feed.js:75`, and already used by the household calendar feed |

### And here is the problem

**`householdIds` needs the WHOLE address book.** It walks every link in both
directions over the full array — it cannot work from one record.

The address book is now closed: a volunteer may list it, an **Attender may
not** (A-030). And "Your family this week" is a section on *Sarah's* Home, and
Sarah is an Attender. **So the family rule cannot be computed on the phone at
all.** Not for the person it is most for.

### What it needs: one function, no new logic

`myFamily()` in codebase `hub`, the same shape as `whoAmI`:

- takes nothing; reads the caller's `memberId` off their verified token's
  account, exactly as `myDates` does
- calls the `householdIds` that already exists in `rota-feed.js`
- returns, for each person in the household, **`{ id, firstName }` and nothing
  else** — no surname, no telephone number, no address, no email. A-043 is
  why: a household list is for saying "Oliver · drums, Sun 15 Nov", not for
  carrying contact details onto a phone
- and for each of them, their serving dates from `events` — **when and where
  only, no team tools**, which is what §4 asks for

**Three things this settles, so nobody has to decide them twice:**

1. **Children with no account appear through the household** and nowhere else.
   A child has no `users` document and no email (YOUTH-ACCESS.md); the parent
   sees them because they are in the household, which is §4's own answer.
2. **The events window joins children's Sunday groups by the parent's
   sign-in email** (their A5), because `kids*` is registered that way rather
   than by `householdId`. That is theirs and it does not conflict: two
   different joins onto the same screen, each owned by whoever holds the data.
3. **Youth groups come through the household** and are mine, per §4 and their
   A5.

### What it does NOT need

A `household` collection. A `familyId`. A mirrored copy on `users/{uid}`.
Any of those would be a second model, and §4 says not to make one.

---

## 4. How teams become data the office manages

Today `TEAMS` is a constant in `egbc-auth.js`, and a team's name is written by
hand into five places (A-053). What §6 wants is the office doing it.

### What a team actually is, as the code uses it

| Used as | Where |
|---|---|
| a key in `markers` on an address book record | the whole access model |
| a key in `adminFor` | who administers it |
| a label and a colour | the Menu dot, the app's space colour |
| a string in `firestore.rules` | `onTeam('Kids Church')`, `canAct('Worship Team')` |
| a tick in `addressbook.html` | two hand-written lists |
| a space in the app | `SPACES` in the mock-up |

### The shape

A `teams/{teamId}` collection, where **`teamId` is the team's name as the
rules already spell it** — `Kids Church`, `Worship Team`, `Maintenance`. That
is the one decision that makes this cheap: every `markers` array, every
`adminFor`, and every string in the rules keeps working untouched.

```
teams/Kids Church
  name:      'Kids Church'      // what the office typed
  label:     'Kids Church'      // short form for a tab
  colour:    '#7a5f4a'
  tint:      '#2e241d'
  parent:    ''                 // 'Worship Team' for Choir, as TEAMS has today
  rota:      true               // false for Elders, Finance, Safeguarding
  tabs:      ['rota','sunday','team']
  order:     30
  archived:  false
```

- **read: `active()`** — every Attender needs the labels and colours to draw
  anything. There is nothing private in it.
- **write: `isMaster()`** — adding a team grants access to whoever is ticked
  into it, so it is not an ordinary admin job.
- **`rota: false`** is how §6's *"Elders, Finance and Safeguarding are private
  user groups rather than rota teams"* is expressed without a second concept.

### What has to change, and in what order

1. `egbc-auth.js` reads `teams` and keeps `TEAMS` as the **fallback** — a page
   that loads before the read lands must still draw. One read, cached.
2. `addressbook.html`'s two hand-written tick lists are generated from it.
   Both, or an admin can tick a team they cannot administer.
3. `tests/test-account.mjs`'s `ALL_TEAMS` reads it, so the sweep account is on
   every team including ones added later.
4. The Menu's team headings are generated for team spaces.
5. **The rules do not change at all** — that is the point of keying by name.

### Two things that are deliberately NOT in it

- **No rules generated from data.** A team's name appearing in `teams` must
  never grant anything by itself; `markers` on a record is still the only
  switch. Otherwise adding a team would be a way of granting access.
- **Renaming is not supported in v1.** A rename means rewriting every
  `markers` and `adminFor` array that mentions it, plus any rule that names
  it. Archive-and-create is the safe answer; §6 says "renames", so **this is a
  decision for Martin**: accept archive-and-create, or wait for a migration.

---

## 5. F-130 — do the shell's helpers make database text safe?

**The mock-up's do not, and you are right to ask.** Two separate gaps:

```js
function esc(s) { return String(s).replace(/[&<>"]/g, …); }   // line 195
```

1. **`row()`, `sec()` and `next()` do not escape anything** — and this is the
   live one. They concatenate their arguments straight in (lines 198–207), so
   `row('music', song.title, …)` with a title containing `<b>` renders the
   `<b>`, and one containing a `<script>` tag runs it. Every call in the
   mock-up passes a literal, which is the only reason nothing shows.
2. **`esc()` does not escape `'`.** It handles `& < > "`. **This one is
   latent, not live**: I checked, and every attribute the mock-up builds is
   double-quoted (`data-act="…"`, `style="…"`, `aria-label="…"`), so there is
   nowhere for a bare apostrophe to break out today. It is still wrong to
   carry forward — the next helper somebody writes with single quotes makes it
   live, and it costs one character to fix.

### What the shell will do

**The helpers will escape, so a screen cannot forget.** The contract:

| Argument | Treated as |
|---|---|
| `title`, `sub` on `row()` | **text** — escaped by the helper |
| `title` on `sec()`, `next()` | **text** — escaped |
| `day`, `mon`, `sub` on `next()` | **text** — escaped |
| `icon` | a Lucide name — validated against `/^[a-z0-9-]+$/`, not escaped |
| **`right` on `row()`** | **HTML, by design** — it carries `<span class="pill">`. The caller owns it |
| **`inner` on `sec()`**, `actions` on `next()` | **HTML, by design** — they carry cards and buttons |
| `act` | matched against the known action shapes; anything else is dropped |

And `esc()` will escape `' ` as well as `& < > "`.

**So: pass database text as `title`/`sub` and it is safe. Pass it inside
`right` or `inner` and it is yours to escape** — those two are HTML on
purpose and cannot be both. I will name that in the shell's own comments, and
there will be a check that feeds a name containing `<script>` and an
apostrophe through every helper and fails if either comes out live.

---

## 6. F-131 — redrawing, and your own click handlers

### a. Can a screen ask to be redrawn when new check-ins arrive?

**Yes, and the shell will provide it rather than you reaching for `draw()`.**

```js
EGBCApp.refresh('kids', 'today');   // redraws only if that screen is showing
```

It is a no-op if the person has navigated away, which is the behaviour you
want: a check-in arriving while somebody is on another tab must not yank them
back.

**And the shell will give you a teardown hook, because you will need one.**
A screen is re-rendered from scratch on every navigation, so an `onSnapshot`
started in a render function would be started again on each one and never
stopped — four navigations, four listeners, four redraws per check-in.

```js
V.kids_today = function () { … return html; };
V.kids_today.watch = function (refresh) {
  const stop = db.collection('checkins')…onSnapshot(() => refresh());
  return stop;            // the shell calls this when the screen goes away
};
```

The shell calls `watch` once when the screen opens and the returned function
when it closes. If that shape does not suit you, say so now — it is cheaper
to agree it than to unpick leaked listeners later.

### b. Is it fine for save buttons to use their own click handling?

**Yes, with one caveat that will bite otherwise.**

`data-act` exists for *navigation*, so the shell keeps back behaviour and the
scroll reset in one place. A save, a toggle, a form — your own handling, and
that is expected.

**The caveat: the DOM is rebuilt on every render, so a listener attached to an
element after rendering is lost the next time the screen draws.** Two ways
that work:

1. **Delegate**, which is what the shell does: one listener on a container,
   matched with `closest('[data-save]')`. Survives every render.
2. **Re-attach inside `watch`**, or inside a render-complete hook — but then
   remember it runs again each render.

What does **not** work is `document.getElementById('save').onclick = …` once
at load. The element is replaced. This is the same trap as A-033 and A-044 in
my own checks, which is why it is worth saying plainly rather than leaving you
to find it.

**And one ask back:** anything a finger lands on is **at least 48px high**
(§7). A 36px button is right on a desktop page and wrong here.

---

## What I need from Martin before building

| | |
|---|---|
| **a** | **"My details": who can see a telephone number and an address?** Everyone signed in, Church members, volunteers, or nobody but the office. It is a policy and it decides a field. |
| **b** | **Teams as data: is archive-and-create acceptable instead of rename?** A real rename means rewriting every record that mentions the team. |
| **c** | **Giving: which service?** One row in the mock-up with nothing behind it. |
| **d** | **The Kids Church board is leaders-only** — confirmed 10 Oct, noted here so the app's Kids Church space does not offer it to the team. |

None of these blocks starting: the shell, the spaces, the tabs, Home and the
phone fixes can all be built while they are open.
