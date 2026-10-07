# Step S â€” parity audit: does v2 do everything the original site does?

Establish only. Nothing was built, and nothing on the original site was touched.
Run 7 October 2026 against the emulator with synthetic data.

---

## The short answer

**No action on the original site is missing from v2.** Every one of its 51 pages
exists in v2, every action on them is accounted for, and every page is still
reachable. v2 adds 11 pages the original never had.

What is **not** settled is how much of that has been *proved to work* rather
than merely *shown to be present*. That is the gap list in Â§5, and it is the
real output of this audit.

---

## 1. How this was done, and what that cannot tell you

Three passes, each catching what the one before it missed.

1. **Every page.** 51 `.html` files at the repo root, compared by name with
   the 62 in `v2/`.
2. **Every action.** For each page, the function behind every `onclick`,
   `onsubmit` and `onchange`, every function assigned to `window`, and every
   button label â€” pulled out of the source and compared. 57 differences.
3. **Every difference, by hand.** Each of the 57 was then looked for in the
   v2 page *and in every local script that page loads*, because v2 moved a
   great deal of code into shared files. Labels were compared on their words
   only, since A3 changed the wording and replaced emoji with icons.

**What this cannot tell you.** It reads the source, not the running page. It
proves an action still *exists*; it does not prove it still *works*. Where
something has been driven against the emulator, Â§4 says so and names the
check. Where it has not, Â§5 says that plainly rather than letting presence
stand in for proof.

It also cannot tell you what the church actually uses. Nothing below is
called missing on the strength of a grep alone (the F-018 lesson); where a
page looks orphaned, Â§3 says how it is reached.

---

## 2. Pages

| | Count |
|---|---|
| Pages on the original site | 51 |
| Of those, present in v2 | **51** |
| Missing from v2 | **0** |
| New in v2 | 11 |

New in v2: `whatson.html`, `signup.html`, `my-signup.html`, `events-admin.html`,
`places-admin.html`, `meeting.html`, `videos.html`, `data-tools.html`,
and the three Mix Builder pages (out of scope).

---

## 3. Actions

57 actions appeared in the original and not in the v2 page's own source. After
the third pass, **all 57 are accounted for**:

| Why it looked different | Count | Examples |
|---|---|---|
| A label A3 changed | 13 | `ðŸ’¾ Save` â†’ `Save` with an icon; `SEND ALL ROTAS` â†’ `Send all rotas` |
| Code moved into a shared file | 40 | the hub's admin into `hub-app.js`; transcription into `egbc-kbupload.js` |
| Renamed, same job | 4 | `seedPages` â†’ `seedRegistry`, `switchTeam` â†’ `chooseTeam`, "Load defaults" â†’ "Add the missing pages", "+ Add page" â†’ "+ Add" |
| Not a label at all | 1 | `btn:${c.label}`, a template |

**Nothing was dropped.**

### Reachability

22 original pages are not tiles in the v2 hub. None of them is stranded:

- **Reached from the tool that uses them** (7): `music-uploader.html` and
  `sundayplannersonglibrary.html` and `song-summary.html` from the Sunday
  planner and Core Team; the four instruction pages from the tools they
  explain.
- **Part of the sign-in flow** (2): `login.html`, `youth-access.html`.
- **Deliberately out of scope**, and recorded as such in `hub-app.js`
  lines 1556â€“7 (8): `studio.html` and the Calla Design tools it links to â€”
  `birthday.html`, `photoeditor.html`, `sitemaker.html`, `socialmaker.html`,
  `Videoeditor.html` â€” plus `worshiphubapp.html` and `Handover.html`.
- **Hidden on purpose** (4): the training portal and its three practice
  copies, `hidden: true` in the registry until the real tools are finished.
- **Not a page** (1): `SharepointHeader.html`, a fragment.

---

## 4. What has actually been proved to work in v2

Driven against the emulator with synthetic data, reading the result back out
of Firestore rather than off the screen:

| What | Proof |
|---|---|
| Rota: assign by drag and drop | `b1.js` 3/3 |
| Rota: **send all rotas**, end to end | `s0.js` 5/5 â€” six emails composed, none sent |
| Core Team app: assign from the role sheet | `b1.js` |
| Resources: save a link | `b1.js` |
| Places: add, rename, reorder, take out of use, venues, approvers | `walk.js` 15/15 |
| Events: guest sign-up, capacity, waiting list, cancel | `chunk2.js` 24/24 |
| Events admin: create, tickets, questions, attendees, cancel | `chunk2b.js` 19/19 |
| Hub: navigation, "waiting for you", "my serving", the Menu | `stepd.js` 20/20 |
| Videos and the knowledge base: add a video end to end | Step V |
| Firestore rules | 120/120 |
| Storage rules | 21/21 |
| Every page loads, renders, keeps its controls, throws nothing | `smokeall.js` 126/128 |

---

## 5. Gaps â€” numbered, for Martin to decide

### S-001 â€” most pages' main action has never been driven in v2
This is the one that matters. Thirty-odd pages are proved to *load* and no
more. Loading clean is weak evidence: `inventory-system-2.html` loaded clean
for months while a duplicate `const` meant it had never run in v2 at all.

Not yet driven: `EmailBuilder2.html`, `SundayServicePlanner.html`,
`addressbook.html`, `youthapp2.html`, `youthserviceplanner.html`,
`Library.html`, `batchupload.html`, `music-uploader.html`,
`inventory-system-2.html`, `schematic.html`, `MonitorStageMap.html`,
`stickynotes.html`, `index.html` (the public availability form),
`login.html`, `trainingportalhub.html` and the training copies,
`hubresources.html`, the four charters, the four instruction pages.

**The availability form and login are the two to do first**: the form is the
one page the whole church touches, and login is the door.

### S-002 â€” nine places still call the email service directly
`CoreTeamApp` (2), `Planner` (3), `EmailBuilder2`, `SundayServicePlanner`,
`youthapp2`, `youthserviceplanner`, `hub-app.js`. On localhost they are now
held by `egbc-nosend.js` (S0); in production they bypass `egbc-email.js`
entirely. Moving them is **Step T** and is already scheduled.

### S-003 â€” the `rotas/` storage path still accepts uploads from nobody
`storage.rules` lets anyone write a 25MB PDF to `rotas/`, with no sign-in.
Nothing in the repo writes there any more â€” the planner uses `rota-temp/`,
which S0 added a rule for â€” but the path is still open.

**Checked while writing this**: nothing on the original site writes to it
either, so it can be closed without breaking anything. Not closed here,
because this step is establish-only and a storage rule is a change. One
line when Martin says so.

### S-004 â€” on localhost the rota PDFs have no logo
Since Storage was pointed at the emulator (Step D), the logo is fetched from
a bucket that does not have it. The page handles it â€” the PDF is simply
built without a logo â€” so this affects testing only, not the church. Worth
knowing before somebody reports it as a bug.

### S-005 â€” `Handover.html` belongs to nobody
In the repo, excluded from the hub as "not part of this suite", linked from
nothing. Probably finished with. **Martin's call**: keep, hide, or delete.

### S-006 â€” this audit compared source, not behaviour
Everything in Â§3 is "the action is still there". Turning that into "the
action still works" is S-001. Said here so the two are not confused when
this is read back in a month.

---

## 6. What I would do next, if asked

Not a decision â€” a recommendation for S2:

1. **The availability form and login**, driven end to end. The form is the
   page every member uses and the only one with no sign-in.
2. **The address book**, because every rota depends on it.
3. **The Sunday planner and the email builder**, which send.
4. The rest in the order the church actually opens them, which Martin knows
   and I do not.

---

# S2c â€” every page side by side against the original

Run 7 October 2026. This closes S-006: Â§3 said an action was still *there*;
this says what each page actually *draws*.

`node tests/compare-with-original.mjs` loads each page from the original site
and from v2, **against the same synthetic data, both sides signed in as the
same synthetic member**, opens everything behind a tab or a sheet on both, and
compares what a person would see before touching anything: the rows a list
opens with and their order, the values already in the fields, which option is
selected, every control and what it is wired to, and every heading.

On the pages where most of what happens is behind choosing something first, it
also **drives the main flow**, the same steps in the same order on both sides:
pick the date and the service on the Sunday planner, the youth planner and the
youth app; pick a term, expand every term and choose a person for the PDF on
the Rota Planner; pick a member and expand every term on view-only-rota; open
the service planner, a service, the rota and the meetings on CoreTeamApp; open
each person in the address book; type a member's address into the availability
form and press Check My Services. Nothing in a flow writes: both sides share
one database, so a step that saved would change what the other then read.

**A page with an error on its console is a failure, on either side.** An
uncaught exception or a `console.error` fails the run. That rule found the
logo (below) within minutes of being added.

### Pointing the originals at the synthetic data was most of the work

Starved of a database an original draws its empty state, and then a real
difference and a missing database look exactly alike. Getting both sides onto
the same data took three goes:

1. **26 of the 51 originals import the SDK as ES modules** - including the Rota
   Planner, the Sunday Service Planner, the address book, the availability
   form, view-only-rota and the youth planner. There is no `firebase` global to
   patch on those, so the first hook did nothing and they stayed pointed at
   live, refused, drawing nothing. Their import of `firebase-app.js` is now
   answered with a module that re-exports the real one and wraps
   `initializeApp`.
2. **Firebase 8.10.1 loads `firebase-app.js` as a classic script** with the
   same file name. The first version of that rewrite swapped it for an ES
   module and broke eight pages outright, and the check reported them as losses
   in v2. Only an `import ... from` is rewritten now, and any SDK script tag -
   8.10.1 or a 9+ compat build - gets the global hook, where before only
   "-compat" did.
3. **The originals never sign in.** The live site has open rules and never
   needed an account; against the real rules an unsigned read is refused. The
   hook signs them in as the synthetic member, adds the auth SDK to pages that
   never loaded it, and the page is loaded a second time so its reads carry the
   session rather than racing it. Before that, `youthapp2.html` alone reported
   46 losses; afterwards, none.

## The short answer

**Nothing is lost on any of the 51 pages.** 49 compare straight through; the
hub and the login page are settled by a check of their own, below, and nothing
is lost on either. Eleven real losses were found across the step and all eleven
are fixed, each with a check that fails when the fix is taken out again.

## What was lost, and is not any more

**The news board on the dashboard** (`EGBCWorship&AV.html`) had lost most of
itself, and a comparison of the source could not have seen it, because the page
still had a news feature:

- the **Manage** button, and with it any way to edit or remove a news item that
  already existed â€” v2 could only ever add another one;
- **Show until**, so an item could no longer be set to disappear by itself
  after a day: the field, the stored value and the filter had all gone;
- the strip that takes `<style>` and `<meta>` out of a pasted newsletter, so
  one pasted email would have restyled the whole dashboard;
- `saveDashToDb()` saying whether it had saved, and the roll-back that goes
  with it. A failed save left the change on screen with nothing but a small
  status chip, so whoever made it had no reason to think it had not been kept.

Proof: `node tests/check-news-dashboard.mjs`, 7/7. Put the expiry filter and
the style strip back the way they were and exactly those two checks fail.

**Five pages were building their own Firebase app on the live config** â€”
`trainingbatchimporter`, `trainingmusicdatabase`, `trainingportalhub`,
`training Sunday planner`, `trainingrotaplanner`. Two consequences: served from
localhost they read the **live** database while every other page read the
emulator, so development on them was working on real data; and their reads
carried no signed-in user, so the day the rules are deployed they would have
been refused and a training session would open on an empty page. All five now
use the shared connection. Giving two of them `await ready` also gave them the
start-up race from S2a, so one needed that fix as well â€”
`tests/check-late-handlers.mjs` is what said so.

**A Kids Church role stored under its old name was being erased.** The role
names were deliberately redone (Leader, Assistant and Helper, with CrÃ¨che,
replacing Group Leader (Younger/Older) and Supporting Adult) â€” that is an
agreed change. But a record written before it still holds the old words, the
loader did not find a checkbox to tick, and because saving rebuilds the list
from whatever *is* ticked, the next save deleted the role without a word. An
unmapped role is now kept, shown ticked and labelled "(old name)".
Proof: `node tests/check-old-kids-roles.mjs`, 4/4; take the fix out and the
save deletes the role.

**What the mapping should be is still a decision**, not a guess: nothing here
says that Supporting Adult becomes Assistant or Helper. The old name is kept
visible until somebody says.

**The availability form would have lost its logo.** The church logo and the
header images sit at the **root** of the storage bucket â€” they were uploaded
before any folders existed â€” where no rule in `storage.rules` reached them.
Deploying as it stood would have refused them on every page that shows one,
including the two with no sign-in at all: the availability form, which goes to
the whole team once a term, and login. The six branding files are now named one
by one, read only, with nothing writable at the root.
Proof: Storage rules 39/39, three of them new; break the rule and exactly one
fails. Found by the console rule, not by looking: the page still drew and the
form still worked, and the logo was simply missing.

## The two pages that need a check of their own

- **`hub.html`** â€” `node tests/check-hub-tools.mjs`, 3/3. The generic
  comparison cannot settle it. Both hubs list the same registry and draw it
  differently: the original makes each tile an `<a href>`, v2 draws a row and
  groups the list â€” phone apps under Apps, help pages as a "?" on the tool they
  explain, charters together, a section per team. Comparing controls then
  reports twenty tiles "missing from v2" that are all present and reachable,
  and a real loss would be buried among them. The check compares what each hub
  **offers**, by title, which does not care what element a title is drawn in:
  **v2 offers every page the original offers, and fifteen more.** The admin
  panel was checked separately too â€” People, Youth access codes and the Page
  registry, with Unlink, Wrong person?, Send code, Add page and Edit, plus
  Notices, Check every link and the bring-across tools.
- **`login.html`** â€” `EGBC_SKIP_SIGNIN=1 node tests/compare-with-original.mjs
  login.html`. Signed in, **both** login pages send you to the hub, which is
  what a login page is for, so there is nothing to compare unless the run is
  signed out â€” and it cannot be signed out for one page without signing out of
  the other fifty. Signed out: one difference, the button `linkBtn` reading
  "Email me a sign in link" where the original said "Send me a link". Same id,
  same handler. Wording.

## What the check deliberately does not compare

**Data.** Both sides read the same synthetic database now, so most of what used
to be noise has gone. What remains is where one side has written something the
other has not seen â€” a list with rows on both sides that are not the same rows.
Those are counted as data and reported separately. Where **v2's list is empty
and the original's is not**, that is a loss â€” which is exactly the shape of the
bug that started all this, the Sunday planner opening with no order of service.

**Generated ids.** Rows are built with ids from `Date.now()` or a random
string, so the same container has a different name on each side and on every
load, and a handler is called with a different argument. Containers named that
way are counted and skipped, and a handler's arguments are masked so that what
is compared is the function it still calls.

## Four ways this check lied before it was trusted

Worth writing down, because each one produced a long, confident list of
failures that were nothing of the kind.

1. **It read the church's live database.** Live Firebase was blocked with a
   list of hosts to *refuse*, and the original pages got past it: real members'
   names and a real service note came back in the output. The hole was
   `./sw.js` â€” several pages register a service worker, a service worker's own
   fetches are not intercepted, and its scope is the whole origin, so one page
   registering it could serve every later page. Now: an **allowlist** of
   localhost and seven CDN hosts; service worker registration stubbed on both
   sides; and a **response** from any host off this machine fails the run
   outright. An attempt is not a leak; a reply is. Every output file and
   screenshot made before that was deleted, and none was ever committed.
2. **It kept one browser profile between runs**, and state carried over. One
   page reported nineteen headings that are in neither copy of it and nowhere
   in the repository. A fresh profile every run, thrown away afterwards.
3. **It trusted that it had loaded the page it asked for.** Several pages
   navigate themselves once they know who you are. It now proves which page it
   measured and says "not compared" rather than inventing a page of losses. The
   originals' storage is also wiped between pages: all 51 share one origin, and
   the training pages keep their whole working copy in `sessionStorage`.
4. **It compared the originals with no database at all**, which is the one that
   would have mattered most, because it made the whole exercise look finished
   when it was not. An original with nothing to read draws its empty state, so a
   real difference and a missing database are indistinguishable â€” and a page
   that had genuinely lost half its contents would have passed. Both sides now
   read the same synthetic data, signed in as the same member; see the three
   things that had to be fixed before that was true, at the top of this
   section. On `youthapp2.html` alone it was the difference between 46 reported
   losses and none.

## The per-page table

Run on b1464827, both sides against the same synthetic data, both signed in,
with the main flow driven on the eight pages that have one.

Every page is opened on both sides and everything behind a tab, sheet or modal
is revealed in one pass, so "states" is not a count per page here â€” it is every
panel the page has. (The style check, `check-style-every-screen.mjs`, is the
one that works through named states one at a time; CoreTeamApp has 19.)

**(a)** agreed Â· **(b)** restyle Â· **data** both sides have rows and the rows
differ Â· **(c)** loss Â· **err** a console error, on either side.

| Page | a | b | data | c | c fixed | err |
|---|---|---|---|---|---|---|
| AVteamlandingpage.html | 0 | 0 | 0 | 0 | â€” | â€” |
| CoreTeamApp.html | 40 | 0 | 5 | 0 | â€” | â€” |
| Coreteamcharter.html | 0 | 0 | 0 | 0 | â€” | â€” |
| EGBC-HowTo-AV.html | 0 | 0 | 0 | 0 | â€” | â€” |
| EGBC-PlayThrough.html | 0 | 0 | 0 | 0 | â€” | â€” |
| EGBC-Training-Worship.html | 0 | 0 | 0 | 0 | â€” | â€” |
| EGBC-Troubleshoot-AV.html | 0 | 0 | 0 | 0 | â€” | â€” |
| **EGBCWorship&AV.html** | 0 | 0 | 2 | **4** | **4** | â€” |
| EmailBuilder2.html | 0 | 0 | 0 | 0 | â€” | â€” |
| Handover.html | 0 | 0 | 0 | 0 | â€” | â€” |
| Library.html | 0 | 0 | 0 | 0 | â€” | â€” |
| MonitorStageMap.html | 0 | 0 | 0 | 0 | â€” | â€” |
| Performancenotes.html | 0 | 0 | 0 | 0 | â€” | â€” |
| Planner.html | 4 | 0 | 0 | 0 | â€” | â€” |
| Serviceplannerinstructions.html | 0 | 0 | 0 | 0 | â€” | â€” |
| SharepointHeader.html | 0 | 0 | 0 | 0 | â€” | â€” |
| SundayServicePlanner.html | 0 | 0 | 0 | 0 | â€” | â€” |
| Videoeditor.html | 2 | 0 | 0 | 0 | â€” | â€” |
| Worshipteamcharter.html | 0 | 0 | 0 | 0 | â€” | â€” |
| Youthcharter.html | 0 | 0 | 0 | 0 | â€” | â€” |
| **addressbook.html** | 6 | 0 | 1 | **1** | **1** | â€” |
| batchupload.html | 0 | 0 | 0 | 0 | â€” | â€” |
| birthday.html | 0 | 0 | 0 | 0 | â€” | â€” |
| emailcompilerinstructions.html | 0 | 0 | 0 | 0 | â€” | â€” |
| hub.html *(own check)* | â€” | â€” | â€” | 0 | â€” | â€” |
| hubresources.html | 0 | 0 | 0 | 0 | â€” | â€” |
| **index.html** | 0 | 0 | 0 | **1** | **1** | â€” |
| inventory-system-2.html | 0 | 0 | 0 | 0 | â€” | **1 orig** |
| login.html *(signed out)* | 0 | 1 | 1 | 0 | â€” | â€” |
| music-uploader.html | 0 | 0 | 0 | 0 | â€” | â€” |
| photoeditor.html | 0 | 0 | 0 | 0 | â€” | â€” |
| resources.html | 2 | 2 | 2 | 0 | â€” | â€” |
| rotaplannerinstructions.html | 0 | 0 | 0 | 0 | â€” | â€” |
| schematic.html | 0 | 0 | 0 | 0 | â€” | â€” |
| sitemaker.html | 0 | 0 | 0 | 0 | â€” | â€” |
| socialmaker.html | 0 | 0 | 0 | 0 | â€” | â€” |
| song-summary.html | 0 | 0 | 0 | 0 | â€” | â€” |
| stickynotes.html | 1 | 0 | 0 | 0 | â€” | â€” |
| studio.html | 0 | 0 | 0 | 0 | â€” | â€” |
| sundayplannersonglibrary.html | 0 | 0 | 0 | 0 | â€” | â€” |
| **training Sunday planner.html** | 0 | 0 | 0 | **1** | **1** | â€” |
| **trainingbatchimporter.html** | 0 | 0 | 0 | **1** | **1** | â€” |
| **trainingmusicdatabase.html** | 0 | 0 | 0 | **1** | **1** | â€” |
| **trainingportalhub.html** | 1 | 0 | 0 | **1** | **1** | â€” |
| **trainingrotaplanner.html** | 0 | 0 | 0 | **1** | **1** | â€” |
| uploaderinstructions.html | 0 | 0 | 0 | 0 | â€” | â€” |
| view-only-rota.html | 0 | 0 | 0 | 0 | â€” | â€” |
| worshiphubapp.html *(out of scope)* | 0 | 0 | 1 | 0 | â€” | **2 both** |
| youth-access.html | 0 | 0 | 1 | 0 | â€” | â€” |
| youthapp2.html | 1 | 0 | 0 | 0 | â€” | **2 orig** |
| youthserviceplanner.html | 0 | 0 | 0 | 0 | â€” | â€” |
| **51 pages** | **57** | **3** | **13** | **11** | **11** | **5** |

`losses to fix: 0`, and no data came back from anywhere off this machine.

The eleven losses are counted on the page they were found on. The `c` column is
what S2c **found**; a re-run on the finished tree reports none. Two of them are
not page changes: the five training pages are one fault repeated, and
index.html's is the storage rule for the logo, which fixed it on every page
that shows one.

The 57 agreed differences are, in order of how many: emoji replaced with Lucide
icons (R-013), the Kids Church roles renamed and the worship planners showing
Worship and AV only (Martin, 05c9be63), Join opening `meeting.html` so a call
stays inside the installed app (ONE-APP Â§5), and sentence case (A3).

### The three console errors, and whose they are

- **`inventory-system-2.html`** â€” the ORIGINAL declares `const db` twice in one
  script. That is a SyntaxError, so the whole script stops. v2 declares it once
  and is clean: v2 fixes a bug the original has.
- **`youthapp2.html`** â€” the ORIGINAL throws twice on start-up. v2 is clean.
- **`worshiphubapp.html`** â€” both sides throw the same thing, so v2 inherited
  it rather than caused it. This page is out of scope for this window (Â§4 of
  ONE-APP-BRIEF), so it has been left alone and reported instead. It also still
  builds its own Firebase app on the live config, exactly as the five training
  pages did.

## Still open, for Martin

- **`worshiphubapp.html` reaches live Firestore from localhost.** It builds its
  own Firebase app and hooks no emulator, exactly as the five training pages
  did. It is out of scope for this window, so it has been left alone â€” but the
  same two consequences apply to it.
- **`worshiphubapp.html` throws on start-up**, on both sides — so v2 inherited
  it rather than caused it. Same page, same reason for leaving it.
- **`birthday.html` and `youth-access.html` are still drawn in Montserrat.**
  Group 2, not yet restyled; `tests/smoke-all-pages.mjs` reports 126/128 and
  those are the two.
- **What a Kids Church "Supporting Adult" should become** — Assistant or
  Helper — is a decision nobody has made. Records holding the old names are
  kept and labelled "(old name)" so that nothing is lost in the meantime.
- **F-031, from the events window**: it asks for its five new pages to be added
  to `check-style-every-screen.mjs`, with the screens each one needs, and for a
  Forms entry on the hub. Not done — their request, routed through Martin.
- **The deployed-rules era will break the ORIGINAL site**, which matters only
  if it is meant to keep working after switch-over. Several original pages read
  collections that now need an active member and never sign in; against the
  real rules they are refused. v2 is unaffected.
