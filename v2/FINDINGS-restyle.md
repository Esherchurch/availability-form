# Findings — restyling the v2 pages

Numbered for the Code windows. Every claim about existing code was made after
opening the file named.

Group 1 opened 2026-10-06. Step A (finishing Group 1) 2026-10-06.

---

## R-009 — five pages never connect to the emulator, and I wrote to live data

**Read this before driving any of those pages locally.**

`egbc-auth.js` connects to the emulators when the page is served from
localhost, so "serve it from localhost" has meant "it is talking to the
emulator". That is only true of pages that use `EGBCAuth.db`.

These five call `initializeApp()` for themselves and never connect anything:

| Page | Firestore it talks to |
|---|---|
| `addressbook.html` | **live** |
| `Planner.html` | **live** |
| `SundayServicePlanner.html` | **live** |
| `CoreTeamApp.html` | **live** |
| `view-only-rota.html` | **live** (reads only) |
| `resources.html`, `videos.html` | emulator, via `EGBCAuth.db` |

I assumed localhost meant the emulator, drove the save buttons for the R-006
proof, and **five records went into the live database**: four people in
`addressBook` (two "Diag Person", two "Zed Synthetic …", all on
`@example.invalid` addresses) and one empty `services` document with no date
and no leader. Nothing real was changed or deleted; these are five things that
did not exist before, all written between 15:45 and 15:51 on 6 Oct 2026.

A script that removes exactly those five by document id, printing each one
first and refusing any address book record whose email is not
`@example.invalid`, is in `Downloads/remove-my-test-records.js`.

**What this means for the briefs.** "Synthetic data only, test against the
emulator" is currently impossible for those five pages, and anyone who tries
will do what I did. The fix is the same three lines `egbc-auth.js` already has,
in each page's own init — or better, have them use `EGBCAuth.db` like
`resources.html` and `videos.html` do, which is one connection instead of six.
That is a behaviour change, so it is recorded here rather than done inside a
restyle: `RESTYLE-BRIEF.md` says look only, stop and record.

**Until it is fixed, do not click save on those five pages on localhost.**

---

## Step A — done

### R-001 — the theming engine now lives in `egbc-ui.js`
Moved out of `egbc-shell.js` unchanged, with one change to how it is switched
off: `data-theme="off"` is read from this script's own tag **or** from the
`egbc-shell.js` tag, because when the shell loads `egbc-ui.js` itself,
`document.currentScript` is a tag the shell generated and carries no
attributes. `contenteditable` is still skipped. No copy was left behind in the
shell.

`egbc-ui.js` is now loaded directly by the four in-scope pages that have no
bar: `CoreTeamApp.html`, `youthapp2.html`, `index.html`, `login.html`.

Checked on all ten pages, with the bar and without: the engine ran, the body
computes to Inter, no element is left in Montserrat, and no element is left
uppercase — 39 of 40 checks, the one failure being R-010 below, which is older
than this change.

### R-002 — emoji replaced in Group 1
`CoreTeamApp.html` home tiles: calendar-days, users, video, mail, each in a
36px tinted badge rather than a 28px character. `resources.html` empty state:
folder-open. The one in the meetings list went earlier.

Emoji inside people's own content were left alone.

### R-003 — team colours are dots now
`resources.html` drew the selected team tab as a solid fill in that team's
colour. It is now the brand's selected style — tint background, ink text — with
the team colour as an 8px dot beside the name, per `DESIGN.md`.

### R-004 — "View the site as" is sentence case
It is in `egbc-auth.js`, not the shell: my Group 1 report said the shell and
that was wrong. The text was already sentence case in the source; the capitals
came from `text-transform` on the span. Now Inter, 13px, weight 500, 8px radii,
`DESIGN.md` colours. Nothing about how viewing-as works was touched.

### R-005 — the phone apps no longer scroll sideways
Measured rather than guessed. `Planner.html` was 476px wide inside 375px: the
row already wrapped, but the strip of six team checkboxes inside it did not —
a 418px line. It wraps now. `SundayServicePlanner.html` was 598px because
`#serviceTypeNotes` was a flex child that could not shrink; `min-width:0` at
≤640px is what lets `flex-1` mean what it says.

Both now measure a scroll width of exactly 375 with no element past the edge.

---

## Group 1 — where it stands

### R-006 — cards and lists rebuilt to the card spec — DONE
All seven Group 1 pages now draw cards and rows to `DESIGN.md`: white surface,
1px `#e5e7eb` line, 14px radius and the small shadow; a row at 8px with the
name at 14px/600 in ink and one muted 13px line under it; card headings in
sentence case at 13–14px/600 with a divider below.

What went, and why: the 3px coloured bands across the CoreTeamApp tiles, the
solid brand header bands on the Planner and the rota, the brand-filled date
capsules, the 7–10px labels in 800 and 900 weight set in caps, and the
alternating row tints on the Planner — a row that changes colour with its
position carries no information, and the filled-roles dot already says what
the green border was saying.

Nothing was renamed, no id moved and no handler was touched: these are class
strings and CSS blocks only. The drag-and-drop assignment, the role sheet and
the link save all still write, read back from Firestore.

### R-007 — the main-action proof is done for two pages of seven
`resources.html` and `videos.html` use `EGBCAuth.db`, so they can be driven
against the emulator, and adding a video end to end passes, read back from
Firestore rather than from the page.

The other five cannot be proved this way until R-009 is fixed, because driving
them writes to the live database. That is the honest state of it: not "the
pages fail", but "the proof cannot be run safely yet".

What does pass today, on all seven: the page loads signed in, renders, throws
no uncaught error, computes to Inter and keeps its controls.

---

## Found and not fixed

### R-012 — the controls on these pages are still the old style — DONE in A3
Cards and rows are done; buttons, selects, inputs and form labels are not, and
they are what is left shouting. On the Planner: 11px labels in 700 beside every
checkbox, date and time controls as filled capsules, "SEND ALL ROTAS" in caps.
On `view-only-rota.html`: four PDF buttons as brand, green and gold capsules in
9px caps. On `SundayServicePlanner.html`: ten form labels at 11px/700.

Measured, not guessed: a probe reads every leaf element on the rendered page
and reports anything at 700 weight or heavier, in caps, or under 12px. After
this work the rota page reports none, the Planner 30, SundayServicePlanner 10
and CoreTeamApp 3 — and all of those are controls, form labels or the two page
titles, which are legitimately 700.

Controls are their own job across all four groups, so they are parked here
rather than half-done on four pages.

### R-013 — emoji are still on the Group 1 pages, and R-002 overstated it — DONE in A3
R-002 said "emoji replaced in Group 1". That was true of the pages it names and
not of these: `CoreTeamApp.html` carries 80 emoji — the email compiler toolbar,
the team chips, the modal titles, the service-item type glyphs, the whole
onboarding tour — `SundayServicePlanner.html` 9 and `Planner.html` 11, including
the 📹 inside `<option>` elements, where an icon font cannot go and the fix is a
word instead.

Not fixed here: it is R-002's job and it is a sweep of about a hundred sites,
mostly in one file. Recorded so the earlier claim is not left standing.

### R-010 — the Youth Hub help tour throws, and did before this work — FIXED
`showTourStep` in `youthapp2.html` called
`document.getElementById('tour-next')`, and the button at line 1227 had
`class="tour-next"` but no id, so it got null and threw before the tooltip was
ever positioned — the tour was dead.

Confirmed older than this chunk by loading the page with the `egbc-ui.js` line
taken out again: the same error, at the same place, either way.

One attribute, `id="tour-next"`, and nothing else. Same shape as the
CoreTeamApp tour bug fixed in August.

### R-011 — `index.html` and `login.html` now load `egbc-ui.js` but are Group 4
Both are in `NEXT-BRIEF.md`'s list of pages outside v109, so both now load the
engine and are on Inter. Their own content is still the old style and is not
due until Group 4.

---

## Screenshots

`v2/screenshots/restyle/` holds before and after for all seven Group 1 pages at
1280px and 375px, full page, both sets against the same synthetic data. The
after set predates Step A's changes and should be retaken when Group 1 is
actually finished.

---

# Step A3 — controls and emoji

Measured before and after on the rendered page, not read off the source. A
control or a line of text counts as off the guide when it is 700 weight or
heavier, set in capitals, under 12px, a capsule, or in Montserrat.

| Page | Before | After |
|---|---|---|
| addressbook.html | 214 | 0 |
| Planner.html | 130 | 0 |
| places-admin.html | 24 | 0 |
| SundayServicePlanner.html | 14 | 0 |
| view-only-rota.html | 5 | 0 |
| CoreTeamApp.html | 4 | 0 |
| resources.html | 2 | 0 |
| videos.html | 2 | 0 |
| **Total** | **395** | **0** |

Emoji, outside comments: **115 to 0**. CoreTeamApp held 86 of them.

### R-014 — the theming engine beats any page rule, and that is why this took a different shape
`egbc-ui.js` injects
`html:not(.egbc-no-theme) .font-extrabold:not([contenteditable] *):not([contenteditable])`
with `font-weight:700!important`. That is four class-level pieces and it is
injected after the page's own stylesheet, so no sensible page rule outranks
it. The first attempt at A3 was a block of CSS per page, and the weights
stayed at 700 however the selectors were written.

That engine is right: it was built to tame pages nobody had restyled yet,
and it still does. The answer for a page that **is** being restyled is not to
out-specify it but to stop the markup asking for a weight the guide does not
have — `font-extrabold` and `font-black` became `font-semibold`, and
`font-bold` became `font-medium`, in the markup. The engine then has nothing
to clamp.

Worth knowing before Group 2: the engine will go on quietly making a page
look *nearly* right, which is what hid this.

**And the rule A3b exists because of — measure every screen, not the first one.**
A3 measured each page as it loaded, found nothing, and reported zero. That was
true of the opening screen and false of the page. CoreTeamApp keeps five more
screens and a dozen sheets behind buttons: its rota toolbar, its term buttons
and its inline labels were all still 11px, 700 weight and capsule-shaped, and
the source still held 71 weights of 800 or 900 and 26 round-cornered controls.
The measurement could not see any of it, so it said the work was done.

For Group 2, and every group after it:

1. **Name every state a page can be in** before measuring anything — each
   screen, tab, sheet, modal, expanded panel and empty state.
2. **Open each one and measure it on its own.** An element with no
   `offsetParent` is not counted, so a shut sheet contributes nothing to the
   screen in front of it and a measurement taken on the home screen says
   nothing about the other five.
3. **Measure each sheet over the same background** (the home screen), or the
   screen behind it is counted again in every modal and the numbers inflate.
4. **Check the source as well as the screen.** Counting
   `font-weight: 800|900`, `font-size: 7-11px` and `border-radius: 9999px` in
   the file takes one command and catches what no amount of clicking will
   reach. If the source count is not zero, the page is not done, whatever the
   rendered check says.
5. **Skip the email templates, deliberately.** Any line naming Arial is an
   email, which cannot use the web font or the icon font. R-020, agreed.

`measure_screens.js` in the scratchpad does 1-3 and names each state in its
output, so the report can say "rota: 151 to 2" rather than "the page: 0".

### R-015 — two rules of equal weight, and the later one wins silently
`view-only-rota.html` carried two floors for small text: a new one at 13px
and an older "readability pass" at 11px, both `!important`, both equally
specific. The later won, so the member picker stayed at 11px through three
attempts to fix it. The old pass is gone.

### R-016 — capitals that no stylesheet can fix
The team ticks in the address book were typed `CORE`, `WORSHIP`,
`KIDS CHURCH`. The capitals are the text, not a `text-transform`, so the
engine left them exactly as written — correctly. Eighteen labels and two
headings now read in sentence case. **The checkbox values are untouched**:
those are the team names the rota matches on, and changing one would quietly
unassign people. Counted before and after: 16 either way.

### R-017 — places-admin had two headers
`egbc-guard.js` drops a sign-out chip into `#userChip` on any page that has
one, and `egbc-shell.js` puts a bar with Hub, Menu and sign-out on any page
that loads it. Places had both, one above the other. The guard now stands
down where the shared bar is already there. Nothing lost: the bar offers the
same three things.

### R-018 — the Places walk was not repeatable, and said so in the wrong voice
It failed 6 of 15 checks before this step and after it. Not the page: the
walk seeds eight rooms by pressing the page's own Seed button, and that
button does nothing once a site exists. A site existed because the events
seed from Step C had invented one. So the fixture the walk needed never
appeared and four checks failed for a reason that had nothing to do with
Places.

Both ends fixed: the events seed now hangs its events on whatever site and
room are already there, and the walk clears the place records before it
starts. 15/15, twice in a row.

### R-019 — found and not fixed: two pages are still on Montserrat
`birthday.html` and `youth-access.html`. Both are Group 4 and due there.
Proved to pre-date this step by stashing these changes and measuring again.

### R-020 — found and not fixed: the emailed service plan
`SundayServicePlanner.html` builds an HTML email with its own inline styles
— Arial, 9 and 10px, capitals, 800 weight. It is left alone. An email is not
the interface, it cannot use the icon font or the web font, and every mail
client re-renders it anyway. Changing it is a decision about what the church
sends out, not a restyle, and it should be made deliberately.

The plain-text version of the same plan **was** changed, because it used
emoji as list markers: it now reads `1. Song: …`, `2. Prayer: …`.

---

# Step A3b — every screen, not the first one

A3 measured each page as it loaded and reported 0. True of the opening
screen, false of the page. Measured again with every screen, tab, sheet and
modal opened one at a time:

| Page | Before | After |
|---|---|---|
| CoreTeamApp.html | 290 | 0 |
| SundayServicePlanner.html | 12 | 0 |
| resources.html | 3 | 0 |
| places-admin.html | 1 | 0 |
| Planner.html | 0 | 0 |
| addressbook.html | 0 | 0 |
| videos.html | 0 | 0 |
| view-only-rota.html | 0 | 0 |
| **42 screens in total** | **306** | **0** |

CoreTeamApp screen by screen, before: rota 151, service planner 40, email
compiler 19, meetings 16, song modal 18, mailing list 10, new service 8,
new event 7, add item 5, email team 5, confirm 3, drafts 2, who are you 2,
service detail 1, the three role sheets 1 each. Home was 0, which is the
only screen A3 ever looked at.

In the source, counting outside the email templates: 71 weights of 800 or
900, 26 round-cornered controls and 90 sizes under 12px, all now 0.

### R-021 — a weight written as an expression, which no search can find
The assigned name on a rota row was `font-weight:${asgn?'800':'600'}`.
Searching the source for `800` does not find it, and A3b's own source sweep
did not either. Only the page, drawn, showed it — the rendered check kept
reporting one `w700` on the rota screen after three passes that each
claimed to have finished.

Two things follow for Group 2. A source count reaching zero does not mean
the page is done; and a rendered check that still reports something after a
fix is usually right, so look for a second source rather than assuming the
first fix failed.

### R-022 — the measurement pressed "Send all rotas", and the page stopped it
Writing a check that opens every screen, I had it press the button that
opens the send panel. That button is `prepareDistributionPackage()`, which
emails the whole team through the **live** email service — `Planner.html`
calls the address directly, not through `egbc-email.js`, so the emulator
would not have caught it.

**Nothing was sent.** The page's own failsafe ran first: it checks every
team has signed the term off, and with no `rotaSignoff` documents in the
test database (confirmed: zero) it raised "Not ready to send yet" and
returned. In headless Chrome that alert blocks the page, which is why the
run hung for twenty minutes — the hang *is* the evidence it stopped there.

Both ends fixed. The measurement now reveals panels instead of pressing
anything, and stubs `confirm`, `alert` and `prompt` on every page before it
opens a single state. The rule for anything that drives a page: **never
press a control that sends, even to see what it looks like.** Reveal it.

That failsafe is worth knowing about for its own sake: it is the one thing
standing between a stray click and the whole team's inbox, and it worked.

### R-023 — the first A3b numbers were inflated, and the harness was wrong
An early run reported 579 on CoreTeamApp. It measured each sheet over
whatever screen happened to be open, so the email compiler behind a modal
was counted again in every modal after it. Each sheet is now measured over
the home screen and the honest figure is 290. Worth saying because the
first number was quoted before it was checked.
