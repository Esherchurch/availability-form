# Step S — parity audit: does v2 do everything the original site does?

Establish only. Nothing was built, and nothing on the original site was touched.
Run 7 October 2026 against the emulator with synthetic data.

---

## The short answer

**No action on the original site is missing from v2.** Every one of its 51 pages
exists in v2, every action on them is accounted for, and every page is still
reachable. v2 adds 11 pages the original never had.

What is **not** settled is how much of that has been *proved to work* rather
than merely *shown to be present*. That is the gap list in §5, and it is the
real output of this audit.

---

## 1. How this was done, and what that cannot tell you

Three passes, each catching what the one before it missed.

1. **Every page.** 51 `.html` files at the repo root, compared by name with
   the 62 in `v2/`.
2. **Every action.** For each page, the function behind every `onclick`,
   `onsubmit` and `onchange`, every function assigned to `window`, and every
   button label — pulled out of the source and compared. 57 differences.
3. **Every difference, by hand.** Each of the 57 was then looked for in the
   v2 page *and in every local script that page loads*, because v2 moved a
   great deal of code into shared files. Labels were compared on their words
   only, since A3 changed the wording and replaced emoji with icons.

**What this cannot tell you.** It reads the source, not the running page. It
proves an action still *exists*; it does not prove it still *works*. Where
something has been driven against the emulator, §4 says so and names the
check. Where it has not, §5 says that plainly rather than letting presence
stand in for proof.

It also cannot tell you what the church actually uses. Nothing below is
called missing on the strength of a grep alone (the F-018 lesson); where a
page looks orphaned, §3 says how it is reached.

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
| A label A3 changed | 13 | `💾 Save` → `Save` with an icon; `SEND ALL ROTAS` → `Send all rotas` |
| Code moved into a shared file | 40 | the hub's admin into `hub-app.js`; transcription into `egbc-kbupload.js` |
| Renamed, same job | 4 | `seedPages` → `seedRegistry`, `switchTeam` → `chooseTeam`, "Load defaults" → "Add the missing pages", "+ Add page" → "+ Add" |
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
  lines 1556–7 (8): `studio.html` and the Calla Design tools it links to —
  `birthday.html`, `photoeditor.html`, `sitemaker.html`, `socialmaker.html`,
  `Videoeditor.html` — plus `worshiphubapp.html` and `Handover.html`.
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
| Rota: **send all rotas**, end to end | `s0.js` 5/5 — six emails composed, none sent |
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

## 5. Gaps — numbered, for Martin to decide

### S-001 — most pages' main action has never been driven in v2
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

### S-002 — nine places still call the email service directly
`CoreTeamApp` (2), `Planner` (3), `EmailBuilder2`, `SundayServicePlanner`,
`youthapp2`, `youthserviceplanner`, `hub-app.js`. On localhost they are now
held by `egbc-nosend.js` (S0); in production they bypass `egbc-email.js`
entirely. Moving them is **Step T** and is already scheduled.

### S-003 — the `rotas/` storage path still accepts uploads from nobody
`storage.rules` lets anyone write a 25MB PDF to `rotas/`, with no sign-in.
Nothing in the repo writes there any more — the planner uses `rota-temp/`,
which S0 added a rule for — but the path is still open.

**Checked while writing this**: nothing on the original site writes to it
either, so it can be closed without breaking anything. Not closed here,
because this step is establish-only and a storage rule is a change. One
line when Martin says so.

### S-004 — on localhost the rota PDFs have no logo
Since Storage was pointed at the emulator (Step D), the logo is fetched from
a bucket that does not have it. The page handles it — the PDF is simply
built without a logo — so this affects testing only, not the church. Worth
knowing before somebody reports it as a bug.

### S-005 — `Handover.html` belongs to nobody
In the repo, excluded from the hub as "not part of this suite", linked from
nothing. Probably finished with. **Martin's call**: keep, hide, or delete.

### S-006 — this audit compared source, not behaviour
Everything in §3 is "the action is still there". Turning that into "the
action still works" is S-001. Said here so the two are not confused when
this is read back in a month.

---

## 6. What I would do next, if asked

Not a decision — a recommendation for S2:

1. **The availability form and login**, driven end to end. The form is the
   page every member uses and the only one with no sign-in.
2. **The address book**, because every rota depends on it.
3. **The Sunday planner and the email builder**, which send.
4. The rest in the order the church actually opens them, which Martin knows
   and I do not.

---

# S2c — every page side by side against the original

Run 7 October 2026. This closes S-006: §3 said an action was still *there*;
this says what each page actually *draws*.

`node tests/compare-with-original.mjs` loads each page from the original site
and from v2, opens everything behind a tab or a sheet on both, and compares
what a person would see before touching anything: the rows a list opens with
and their order, the values already in the fields, which option is selected,
every control and what it is wired to, and every heading.

## The short answer

**48 of the 51 pages compare with nothing lost.** The other three are handled
below, and nothing is lost on them either. Six real losses were found and all
six are fixed, each with a check that fails when the fix is taken out again.

## What was lost, and is not any more

**The news board on the dashboard** (`EGBCWorship&AV.html`) had lost most of
itself, and a comparison of the source could not have seen it, because the page
still had a news feature:

- the **Manage** button, and with it any way to edit or remove a news item that
  already existed — v2 could only ever add another one;
- **Show until**, so an item could no longer be set to disappear by itself
  after a day: the field, the stored value and the filter had all gone;
- the strip that takes `<style>` and `<meta>` out of a pasted newsletter, so
  one pasted email would have restyled the whole dashboard;
- `saveDashToDb()` saying whether it had saved, and the roll-back that goes
  with it. A failed save left the change on screen with nothing but a small
  status chip, so whoever made it had no reason to think it had not been kept.

Proof: `node tests/check-news-dashboard.mjs`, 7/7. Put the expiry filter and
the style strip back the way they were and exactly those two checks fail.

**Five pages were building their own Firebase app on the live config** —
`trainingbatchimporter`, `trainingmusicdatabase`, `trainingportalhub`,
`training Sunday planner`, `trainingrotaplanner`. Two consequences: served from
localhost they read the **live** database while every other page read the
emulator, so development on them was working on real data; and their reads
carried no signed-in user, so the day the rules are deployed they would have
been refused and a training session would open on an empty page. All five now
use the shared connection. Giving two of them `await ready` also gave them the
start-up race from S2a, so one needed that fix as well —
`tests/check-late-handlers.mjs` is what said so.

**A Kids Church role stored under its old name was being erased.** The role
names were deliberately redone (Leader, Assistant and Helper, with Crèche,
replacing Group Leader (Younger/Older) and Supporting Adult) — that is an
agreed change. But a record written before it still holds the old words, the
loader did not find a checkbox to tick, and because saving rebuilds the list
from whatever *is* ticked, the next save deleted the role without a word. An
unmapped role is now kept, shown ticked and labelled "(old name)".
Proof: `node tests/check-old-kids-roles.mjs`, 4/4; take the fix out and the
save deletes the role.

**What the mapping should be is still a decision**, not a guess: nothing here
says that Supporting Adult becomes Assistant or Helper. The old name is kept
visible until somebody says.

## The three pages that are not compared this way

- **`hub.html`** — the original keeps its admin panel as hidden markup; v2
  builds the same panel in `hub-app.js` when it is opened, so revealing hidden
  elements finds nothing and the comparison reported 51 losses that were not
  losses. Driven by hand instead, opening the panel on both: v2 has the People
  tab, the Youth access codes tab and the Page registry, with Unlink, Wrong
  person?, Send code, Add page and Edit — everything the original had, plus
  Notices, Check every link and the bring-across tools. Nothing lost.
- **`login.html`** — signed in, v2's login page sends you to the hub, which is
  what it is for. Compared signed out (`EGBC_SKIP_SIGNIN=1`): one difference,
  the button `linkBtn` reading "Email me a sign in link" where the original
  said "Send me a link". Same id, same handler. Wording.
- **`resources.html`** — the original is sign-in gated and draws nothing
  without a database. Compared with the original pointed at the **synthetic**
  emulator (`--originals-on-emulator`): nothing lost.

## What the check deliberately does not compare

**Data.** The original is read with no database at all and v2 against the
synthetic emulator, so a list can hold "No news yet" on one side and three
invented notices on the other. Where both sides have rows, the difference is
counted as data and reported separately. Where **v2's list is empty and the
original's is not**, that is a loss — which is exactly the shape of the bug
that started all this, the Sunday planner opening with no order of service.

**Generated ids.** Rows are built with ids from `Date.now()` or a random
string, so the same container has a different name on each side and on every
load. Containers named that way are counted and skipped.

## Three ways this check lied before it was trusted

Worth writing down, because each one produced a long, confident list of
failures that were nothing of the kind.

1. **It read the church's live database.** Live Firebase was blocked with a
   list of hosts to *refuse*, and the original pages got past it: real members'
   names and a real service note came back in the output. The hole was
   `./sw.js` — several pages register a service worker, a service worker's own
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

## The per-page table

Run on 9e86f0ce. Every page is opened on both sides and everything behind a
tab, sheet or modal is revealed in one pass, so "states" is not a count per
page here — it is every panel the page has. (The style check,
`check-style-every-screen.mjs`, is the one that works through named states one
at a time; CoreTeamApp has 19 of them.)

**(a)** agreed · **(b)** restyle · **data** differs only because the original
is read with no database and v2 against the synthetic one · **(c)** loss.

| Page | a | b | data | c | c fixed |
|---|---|---|---|---|---|
| AVteamlandingpage.html | 0 | 0 | 0 | 0 | — |
| CoreTeamApp.html | 2 | 0 | 3 | 0 | — |
| Coreteamcharter.html | 0 | 0 | 0 | 0 | — |
| EGBC-HowTo-AV.html | 0 | 0 | 0 | 0 | — |
| EGBC-PlayThrough.html | 0 | 0 | 0 | 0 | — |
| EGBC-Training-Worship.html | 0 | 0 | 0 | 0 | — |
| EGBC-Troubleshoot-AV.html | 0 | 0 | 0 | 0 | — |
| **EGBCWorship&AV.html** | 0 | 0 | 4 | **4** | **4** |
| EmailBuilder2.html | 0 | 0 | 2 | 0 | — |
| Handover.html | 0 | 0 | 0 | 0 | — |
| Library.html | 0 | 0 | 0 | 0 | — |
| MonitorStageMap.html | 0 | 0 | 0 | 0 | — |
| Performancenotes.html | 0 | 0 | 0 | 0 | — |
| Planner.html | 0 | 0 | 0 | 0 | — |
| Serviceplannerinstructions.html | 0 | 0 | 0 | 0 | — |
| SharepointHeader.html | 0 | 0 | 0 | 0 | — |
| SundayServicePlanner.html | 0 | 0 | 0 | 0 | — |
| Videoeditor.html | 0 | 0 | 0 | 0 | — |
| Worshipteamcharter.html | 0 | 0 | 0 | 0 | — |
| Youthcharter.html | 0 | 0 | 0 | 0 | — |
| **addressbook.html** | 6 | 0 | 0 | **1** | **1** |
| batchupload.html | 0 | 0 | 0 | 0 | — |
| birthday.html | 0 | 0 | 0 | 0 | — |
| emailcompilerinstructions.html | 0 | 0 | 0 | 0 | — |
| hub.html *(driven by hand)* | — | — | — | 0 | — |
| hubresources.html | 0 | 0 | 0 | 0 | — |
| index.html | 0 | 0 | 0 | 0 | — |
| inventory-system-2.html | 0 | 0 | 0 | 0 | — |
| login.html *(signed out)* | 0 | 1 | 1 | 0 | — |
| music-uploader.html | 0 | 0 | 0 | 0 | — |
| photoeditor.html | 0 | 0 | 0 | 0 | — |
| resources.html *(original on the emulator)* | 2 | 2 | 2 | 0 | — |
| rotaplannerinstructions.html | 0 | 0 | 0 | 0 | — |
| schematic.html | 0 | 0 | 0 | 0 | — |
| sitemaker.html | 0 | 0 | 0 | 0 | — |
| socialmaker.html | 0 | 0 | 0 | 0 | — |
| song-summary.html | 0 | 0 | 0 | 0 | — |
| stickynotes.html | 1 | 0 | 0 | 0 | — |
| studio.html | 0 | 0 | 0 | 0 | — |
| sundayplannersonglibrary.html | 0 | 0 | 0 | 0 | — |
| **training Sunday planner.html** | 0 | 0 | 0 | **1** | **1** |
| **trainingbatchimporter.html** | 0 | 0 | 0 | **1** | **1** |
| **trainingmusicdatabase.html** | 0 | 0 | 0 | **1** | **1** |
| **trainingportalhub.html** | 1 | 0 | 0 | **1** | **1** |
| **trainingrotaplanner.html** | 0 | 0 | 0 | **1** | **1** |
| uploaderinstructions.html | 0 | 0 | 0 | 0 | — |
| view-only-rota.html | 0 | 0 | 0 | 0 | — |
| worshiphubapp.html | 0 | 0 | 0 | 0 | — |
| youth-access.html | 0 | 0 | 1 | 0 | — |
| youthapp2.html | 1 | 0 | 0 | 0 | — |
| youthserviceplanner.html | 0 | 0 | 0 | 0 | — |
| **51 pages** | **13** | **3** | **13** | **10** | **10** |

The ten losses are the four on the news board, the five pages building their
own Firebase app on the live config, and the Kids Church role that was being
erased. They are counted on the page they were found on; the `c` columns are
what S2c **found**, and a re-run of the comparison on the finished tree reports
`losses to fix: 0`.

## Still open, for Martin

- **`worshiphubapp.html` reaches live Firestore from localhost.** It builds its
  own Firebase app and hooks no emulator, exactly as the five training pages
  did. It is out of scope for this window, so it has been left alone — but the
  same two consequences apply to it.
- **`birthday.html` and `youth-access.html` are still drawn in Montserrat.**
  Group 2, not yet restyled; `tests/smoke-all-pages.mjs` reports 126/128 and
  those are the two.
