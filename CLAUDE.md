# Read this first: rules for every window working in this repo

Martin (the owner) is dyslexic and writes no code. Reports to him: plain words, short sentences.

## 1. v2 only. Never touch the original site.

- The repo root (everything outside `v2/`) is the **original EGBC site**, live on GitHub Pages and used by the church every week. **Never edit, add or delete any file outside `v2/`**, and never open the live original site (esherchurch.github.io/availability-form/ outside /v2/).
- The same file names exist in both places (for example `CoreTeamApp.html` and `v2/CoreTeamApp.html`). Always work on the `v2/` one, and write full `v2/...` paths in reports.
- The only exception is a change Martin has explicitly approved for the original site in this conversation. Its commit message must contain `[original-site: approved by Martin]`.
- A commit-msg hook enforces this. Each clone must use it, once:
  `git config core.hooksPath v2/tools/git-hooks`
  Never bypass it (`--no-verify`).
- The original site and v2 share **one live database**. Data v2 writes can appear on the original pages, so v2 may add fields but must never change or remove what the original pages rely on.

## 2. Build v2 to be better, not a copy

- v2 must **not lose** anything the original site does. But Martin wants improvements, not a copy (23 Oct 2026: constant comparing "will be stopping it suggesting actual improvements").
- Look at an original page only when you first port it, or when you are about to remove or change a behaviour people rely on. Then read the root file **in git** (`git show HEAD:<file>`), briefly, and say so in your report.
- Otherwise design for v2 and the people using it, and suggest improvements.

## 3. Church HQ: for any church, not just EGBC

- v2 is becoming **Church HQ**, for any church. EGBC is the first church, not the only one.
- Nothing EGBC-specific in code: team names, roles, service types, times, numbers and wording come from church settings, with EGBC's values only as defaults. Code refers to team **jobs** (office, trustees, buildings, pastoral...), never to team names (FINDINGS-churchhq.md H-9).
- No hidden limits that would cut off a big church's data.
- The going-live test is a whole synthetic Church of England parish set up from scratch (3 buildings, about 30 employees, several services a day). Build everything so it would pass.

## 4. Other standing rules

- Never deploy Firestore or Storage rules.
- Test with synthetic data on the emulator. Don't write to the live database unless the reviewing window or Martin says so.
- Each window's full brief: `v2/NEXT-BRIEF.md` (main), the FINDINGS files in `v2/` for each window's work.
