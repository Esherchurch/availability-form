# Checks

Run every one of these from `v2/`, not from here.

| Check | How to run it |
|---|---|
| Every page loads, renders, is on Inter and keeps its controls | `node tests/smoke-all-pages.mjs` |
| The drawn page obeys DESIGN.md, on every screen and not just the first | `node tests/check-style-every-screen.mjs` (add a page name to do one page) |
| Every v2 page against the original it replaced, side by side | `node tests/compare-with-original.mjs` (add a page name for one; `--shots` also saves screenshots) |
| No start-up handler is attached after a top-level await | `node tests/check-late-handlers.mjs` |
| The news board on the dashboard can still be managed | `node tests/check-news-dashboard.mjs` |
| A Kids Church role stored under its old name survives a save | `node tests/check-old-kids-roles.mjs` |
| v2's hub still offers every page the original's hub offers | `node tests/check-hub-tools.mjs` |
| Every control still reads as a control, now the emoji have gone | `node tests/check-icon-buttons.mjs` |
| The Menu is the one Martin approved, read as three different people | `node tests/check-menu.mjs` (add `--shots`) |
| The pin board card is on the page people land on | `node tests/check-pinboard-card.mjs` (add `--shots`) |
| No page links out of v2, and every email link is a full v2 address | `node tests/check-links-stay-in-v2.mjs` |
| The hub's news does everything the portal's news panel does | `node tests/check-news-features.mjs` (add `--shots`) |
| The home page fits on one screen, and the phone order is right | `node tests/check-home-fits.mjs` (add `--shots`) |
| A person's calendar feed holds their slots and nobody else's | `set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions --project egbc-worship-planner "node tests/check-rota-feed.mjs"` |
| "My calendar" works through the browser, end to end | `node tests/check-calendar-end-to-end.mjs` |
| An email carries this church's name and address, not one in the code | `node tests/check-email-church-details.mjs` |
| "Powered by Church HQ" is in its three places and nowhere else | `node tests/check-poweredby.mjs` (add `--shots`) |
| Reminder emails go to the right people, once, and nobody else | `set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions --project egbc-worship-planner "node tests/check-reminders.mjs"` |
| The login page, which needs both sides signed out | `EGBC_SKIP_SIGNIN=1 node tests/compare-with-original.mjs login.html` |
| The availability form’s three functions, with nobody signed in | `set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions --project egbc-worship-planner "node tests/check-availability-form.mjs"` |
| The form **filled in** in a browser, and the youth planner opened signed out | `node tests/check-form-in-browser.mjs` (add `--shots`) |
| What each of the four levels actually gets, in a browser | `node tests/check-levels-in-browser.mjs` (add `--shots`) |
| Every page in v2 is either style-checked or excused with a reason | `node tests/check-every-page-is-checked.mjs` |
| The pages still work when the functions are not reachable (F-118) | `node tests/check-pages-without-functions.mjs` |
| Pairing the projection PC: a code made, redeemed, and the site disconnected | `set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions --project egbc-worship-planner "node tests/check-churchshow-pairing.mjs"` |
| The Connect ChurchShow page, used rather than looked at | `node tests/check-churchshow-page.mjs` (add `--shots`) |
| A young person's phone: a code redeemed through the function, and the Youth Hub opened | `node tests/check-youth-access.mjs` (add `--shots`) |
| Who can read what, read off the rules themselves | `node tests/check-access-levels.mjs` (add `--write` to rewrite ACCESS-LEVELS.md) |

**`v2/design/` is reference, not a page.** `design/app-mockup.html` is the
phone design Martin approved (APP-DESIGN-BRIEF.md) and must stay out of the
page checks. It already is: every check enumerates `*.html` in the v2 root
and none of them reads a subdirectory, which was measured rather than
assumed - 82 files, and the mock-up is not one of them. **If a check is ever
made recursive, exclude `design/` explicitly at that point.**

**Run the browser checks one at a time.** They share one emulator and one
test account, and `giveFullAccess` and `check-menu.mjs` both write
`addressBook/ab_tester`. Two of them at once leaves that record half way
between what each wanted, `refreshFromBook` mirrors it over the user
document, and pages start turning the sweep away - which the style check
reports as "PAGES THIS RUN NEVER SAW" rather than as a failure. Measured, by
running check-menu and check-style-every-screen together on 9 Oct 2026.

| Firestore rules | `firebase emulators:exec --project demo-egbc "node firestore-rules.test.mjs"` |
| Storage rules | `firebase emulators:exec --project demo-egbc "node storage-rules.test.mjs"` |

Each file starts with a comment saying which real failure it exists for. That
is the point of them: every check here was written after something got
through, and the comment is how the next person knows what it is guarding.

## One list of screens

`group1-screens.mjs` holds the pages and every screen each one has. Two checks
walk it — the style check and the icon check — because a second copy is how one
of them quietly stops covering a screen the other does.

Pages marked `restyled: false` are walked by the icon check but not asserted on
by the style check: the restyle has not reached them (R-014), and failing a
gate for work nobody has scheduled turns it into noise. `--all` measures them
anyway.

## A page with an error on its console is a failure

Every browser check here shares `console-watch.mjs`. An uncaught exception or a
`console.error` fails the run, on **either** side of a comparison.

It exists because the Sunday Service Planner opened with an empty order of
service twice. The second time was this window's own fix: calling the start-up
directly when the page had already loaded ran it before the module had defined
`addSong`, so it threw and stopped. The page served 200, drew its frame, and
lost its contents - and the check meant to prove that fix passed, because the
emulator was slow enough that the branch which breaks was never taken. The
browser had said so in one line the whole time and nothing was reading it.

The first thing it found was the church logo: it sits at the root of the
storage bucket, no rule reached it, and deploying would have refused it on
every page including the two with no sign-in at all.

The short list of lines it excuses is the harness cutting the network off.
Every excused line is counted and can be printed, so that list cannot quietly
grow into a place where real errors hide.

## Known to fail, on purpose

`smoke-all-pages.mjs` currently reports **126/128**. The two failures are
`birthday.html` and `youth-access.html`, both still drawn in Montserrat. They
are Group 2 pages and the restyle has not reached them yet - R-014. They are
left failing rather than skipped, because a check that quietly excuses the
thing it is for is worse than a red line.

## What they need

The four browser checks drive headless Chrome over the DevTools protocol and
serve the pages themselves, so **nothing needs to be running first except the
emulators**:

    firebase emulators:start

They sign in as a synthetic member - `places.tester@example.invalid`, which is
nobody - and they need that account to exist in the Auth emulator with an
active member record. Override it with `EGBC_EMU_EMAIL` and `EGBC_EMU_PW`.
Override where Chrome lives with `CHROME_PATH`.

Each refuses to run on an empty session rather than reporting a page as
broken, because signed out, every page redirects to login and a whole run
would be a list of false failures.

The two rules suites bring up their own emulators and need nothing running.

## Rules these follow, all of them learned the hard way

**Nothing that sends is ever pressed.** Buttons that email the team are
revealed, never clicked, and `confirm`, `alert` and `prompt` are stubbed so
anything that asks before acting is cancelled. A measurement once got as far
as "Send all rotas"; the sign-off failsafe stopped it.

**Caching is off everywhere.** A check that quietly tests the previous version
of a file is worse than no check, and that happened: a restored file still
reported as broken.

**Nothing may leave this machine, and that is an ALLOWLIST.** Only localhost
and a short list of CDN hosts get through; everything else is refused,
whatever it is.

It was a list of hosts to *refuse* first, and it leaked. The original pages
carry the live Firebase config and hook no emulator, and they reached the
church's real Firestore through a host the list did not name - real members'
names came back in the comparison's output. A list of things to refuse has to
be complete to work, and it never is. A list of things to allow fails the
other way: something legitimate gets refused and the check says so loudly.

The same refusal is what found five pages building their own Firebase app on
the live config, so development on them was reading real data.

**Synthetic data only.** Nothing here reads, copies or compares against a real
person's record.

**A check nobody has seen fail proves nothing.** Break the thing on purpose,
watch the right check fail, put it back. `check-late-handlers.mjs` was
confirmed that way: it catches `window.onload` the moment it is put back after
the await, and passes once the handler is named and called either way.

## The test account has to be able to open the pages

`check-style-every-screen.mjs` signs in as one invented account and walks every
page. Six of those pages are behind a gate — Core Team, admin, or leader access
for a team — and if the account cannot get in, **EGBCAuth replaces the body with
its refusal card**: "No access to this page", "Admins only", "Not enough
permissions".

That card is not the page. Measured as though it were, it put 57 DESIGN.md
faults on CoreTeamApp that belong to the card — and, the way round that
actually matters, **it once reported a clean 0 across every screen while six
pages had never been opened at all.** Zero problems and zero pages are the same
number.

`EGBCAuth._blockPage()` now marks the body it replaces (`data-egbc-blocked`),
and the check stops on it, names the page and says the number is not about it.

So the invented account needs, in `users/{uid}`:

```
teams:       every team
adminFor:    every team
masterAdmin: true
roles:       { "<each team>": "owner" }
```

`roles` is the one that is easy to miss: `adminFor` and `masterAdmin` do not
clear a `data-role="leader"` gate on their own, which is what the Rota Planner
and the Sunday Service Planner use.

Other checks rewrite this account's profile to suit themselves — `check-menu.mjs`
reads the Menu as three different people and leaves it as the last one. Set it
back before a style sweep, or the sweep reports on doors.

## The Menu, and where it is checked

`check-menu.mjs` does two things, and the second is the one Step N needed.

1. It reads the Menu on the hub as three different people, and as a fourth who
   looks after a site's room bookings without being on Core Team, and compares
   it name for name with the structure Martin approved — **written out by hand
   in the check**, not read from `egbc-menu.js`, so the check cannot agree with
   itself.
2. It then opens the Menu on **every page** — 77 looked at, 55 with a Menu —
   and fails if any of them differs from the hub's.

The second exists because the first was not enough. The Menu was right on the
hub and wrong on the other 55 pages for a fortnight, and a check that read one
page could not see it (A-024 in `FINDINGS-app.md`).

Pages with no Menu are listed in the check with the reason — public pages,
phone apps, the out-of-scope apps — and a page falling out of that list fails.
