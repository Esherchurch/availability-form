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
