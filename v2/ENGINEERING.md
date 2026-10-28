# Church HQ: engineering standards

Written by the reviewing window, 28 Oct 2026, at Martin's request: "make sure we followed best practice". Every window follows this from now on. New code meets it straight away. Existing code is brought up to it in the "make it maintainable" stage (section 9).

The test: **a developer who has never used AI can understand any part of Church HQ, fix it and change it safely.**

Based on Google's own Firebase guidance (Cloud Firestore best practices, "Delete data", "Manage multiple environments", security rules testing), plus ordinary web practice (ESLint, JSDoc type checks, CI, small modules).

---

## 1. Records that link to other records (parent and child)

Firestore has no foreign keys. A record "links" to another only by storing its id, and **nothing deletes or fixes the linked records for us**. Deleting a document does not delete its subcollections either. So every link needs a written rule, and the server must carry it out.

**1a. The data map.** `v2/DATA-MAP.md` lists every collection with:
- what it is, and which window owns it
- its parent, if it has one (for example `bookings` → `events`)
- every id it stores that points at another record (`eventId`, `personId`, `roomId`, `teamId`…)
- its **on-delete rule**, one of:

| Rule | Meaning | Use it for |
|---|---|---|
| **Cascade** | Deleting the parent deletes these too | Things that mean nothing alone: a meeting's private part, a booking's line items, a deck's slides |
| **Block** | The parent can't be deleted while these exist; the page says why and what to do | Rooms with future bookings, teams with people on a future rota |
| **Keep as history** | The child stays, with the parent's name copied in, and the link marked gone | Past rotas, giving records, attendance of kids' sessions, safeguarding and H&S records |
| **Archive, don't delete** | The parent is never deleted, only marked archived and hidden | People, teams, buildings, events with money or safeguarding attached |

Legal records (safeguarding, Gift Aid, accidents, finance) are never cascaded away. They follow the retention rules in `retention.html`, and a person's GDPR erasure goes through the privacy tools, not an ordinary delete.

**1b. The server does the tidying, never the page.** A page can close half-way through. Cascades and "keep as history" are done by an `onDocumentDeleted` (or `onDocumentWritten` for archiving) trigger, using `BulkWriter` or batches of 500, that is safe to run twice. Subcollections are removed with `recursiveDelete`. A "Block" rule is enforced in the security rules or a callable function, not only in the page.

**1c. Parent and child are made together.** When a parent and its child are created at the same time (a meeting and its private part, a booking and its payment), they're written in one batch or transaction, so there's never half of one.

**1d. The orphan check.** A nightly function, `orphanSweep`, reads the data map, finds children whose parent is gone, fixes what the rule says, and logs what it found. The weekly live check reports the count. It should be 0.

## 2. Folder layout and names

- Church HQ moves into **its own repository**, out of the original site's project.
- Folders by purpose: `pages/`, `js/` (shared scripts, grouped by area), `functions/` (by area), `rules/`, `tests/`, `tools/`, `docs/`. Notes and briefs are not mixed with code.
- Names say "churchhq" (or nothing), not "egbc". EGBC is just one church's data.

## 3. Size and shape of code

- **One job per file.** A page's HTML holds the page. Its script lives in its own `.js` file. Aim for under 400 lines per file; over 800 must be split.
- **No copy-and-paste.** If two places do the same thing, it moves into one shared function.
- **Every exported function has a one-line JSDoc comment** saying what it does, with its parameters' types.
- **Comments say why, not what.** No window names, finding numbers (F-312) or dates in code comments; those belong in git history.

## 4. Automatic checks (free, no AI)

- **ESLint** (recommended rules) and **Prettier** for one style everywhere.
- **Type checking** with `tsc --checkJs` reading the JSDoc. There's no build step, so it stays plain JavaScript.
- **Cache stamps** set by a script, never by hand.
- **GitHub Actions** runs lint, type check, rules tests and function tests on every push. A red check blocks the deploy.
- **Dependabot** keeps packages up to date.

## 5. Tests

- **Security rules:** every collection is tested against every kind of person, for read, write and delete, and between two churches (this exists; keep it complete).
- **Functions:** each function has a test of its normal case and its refusals, in `functions/*.test.mjs`, run on the emulator.
- **On-delete rules:** each Cascade, Block and Keep rule from the data map has a test.
- Tests are written alongside the code, but run only by CI and at the going-live test (CLAUDE.md §5).

## 6. Environments and deploys

- **Three Firebase projects:** `dev` (emulator), `staging` (a real copy with test data), `live`. Nothing goes to live without passing on staging first.
- Deploys are done by a script from CI, not by hand, and the version deployed is written to `version.json`.
- **Daily backups** of the database (scheduled export, or point-in-time recovery switched on), and a restore tested once a quarter.

## 7. Secrets, errors and logs

- Secrets only in Secret Manager (as now). Never in code, logs or web addresses.
- Every function logs failures with a clear message and the church id, never personal details.
- Errors on pages are caught and reported to one place, so the weekly check can see them.

## 8. Documentation

- **`docs/HANDBOOK.md`: the developer handbook.** Short (aim for 15 pages). It covers:
  - what Church HQ is
  - how a church's data is kept apart
  - the folder map
  - how sign-in and "who sees what" work
  - how to run it locally, test it and deploy it
  - the data map
  - where each feature lives
  - how to add a page or a function
- **Decision records** (`docs/decisions/`): one short page per big decision (why Firebase, why churches live under `churches/<id>/`, why EGBC stays at the top level).
- **The FINDINGS-*.md work logs are history, not documentation.** They move to `docs/history/` and nobody needs to read them.
- **Help for the people using it:** every page has the "?" help, written in plain words, and an "Ask" box that answers from that help using the hub's AI (section 8a).

**8a. Built-in help.** Help text lives in one place per page (`help/<page>.md`), so it's written once. It is used by:
- the page's "?" panel
- the AI "Ask" box, which answers only from the help text and the person's own access, says when it doesn't know, and points to the right person
- the printed guides

The AI never sees church data in this box, only the help text.

## 9. When

- **From now:** sections 1, 3 (for new code), 5 (tests written alongside), 7 and 8a apply to everything new.
- **The "make it maintainable" stage** (after building, alongside the going-live test): the new repository and folder layout (2), splitting big files (3), the automatic checks and CI (4), staging and backups (6), the handbook and decision records (8).
- The going-live test gains a sixth principle: **"A developer who isn't AI can understand it, fix it and change it."**
