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
| The login page, which needs both sides signed out | `EGBC_SKIP_SIGNIN=1 node tests/compare-with-original.mjs login.html` |
| Firestore rules | `firebase emulators:exec --project demo-egbc "node firestore-rules.test.mjs"` |
| Storage rules | `firebase emulators:exec --project demo-egbc "node storage-rules.test.mjs"` |

Each file starts with a comment saying which real failure it exists for. That
is the point of them: every check here was written after something got
through, and the comment is how the next person knows what it is guarding.

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
