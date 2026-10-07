# Checks

Run every one of these from `v2/`, not from here.

| Check | How to run it |
|---|---|
| Every page loads, renders, is on Inter and keeps its controls | `node tests/smoke-all-pages.mjs` |
| The drawn page obeys DESIGN.md, on every screen and not just the first | `node tests/check-style-every-screen.mjs` (add a page name to do one page) |
| Every v2 page against the original it replaced, side by side | `node tests/compare-with-original.mjs` (add a page name for one; `--shots` also saves screenshots) |
| No start-up handler is attached after a top-level await | `node tests/check-late-handlers.mjs` |
| Firestore rules | `firebase emulators:exec --project demo-egbc "node firestore-rules.test.mjs"` |
| Storage rules | `firebase emulators:exec --project demo-egbc "node storage-rules.test.mjs"` |

Each file starts with a comment saying which real failure it exists for. That
is the point of them: every check here was written after something got
through, and the comment is how the next person knows what it is guarding.

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

**Live Firebase is refused.** A page served from localhost belongs on the
emulator. Where one is not, the check says so instead of reading the church's
real data - which is how it was found that five pages were building their own
Firebase app on the live config.

**Synthetic data only.** Nothing here reads, copies or compares against a real
person's record.

**A check nobody has seen fail proves nothing.** Break the thing on purpose,
watch the right check fail, put it back. `check-late-handlers.mjs` was
confirmed that way: it catches `window.onload` the moment it is put back after
the await, and passes once the handler is named and called either way.
